import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { getConfirmedJobStandard, listJobs } from "../jobs/job-store.js";
import { createScoreProcess, getScoreProcess, runScoreProcess } from "../jobs/score-process.js";

const inboxFile = path.resolve("data/mail/inbox.json");
const cursorFile = path.resolve("data/mail/cursor.json");
const attachmentDirectory = path.resolve("data/mail/attachments");
const supportedAttachment = /\.(pdf|docx|txt)$/i;
const maxAttachmentBytes = 20 * 1024 * 1024;
let pollingTimer: NodeJS.Timeout | undefined;
let pollInFlight: Promise<EmailPollResult> | undefined;

export type EmailInboxItem = {
  id: string;
  messageKey: string;
  messageId?: string;
  subject: string;
  from: string;
  receivedAt: string;
  jobId?: string;
  jobTitle?: string;
  status: "needs_assignment" | "queued" | "processing" | "completed" | "failed" | "ignored";
  attachmentNames: string[];
  storedAttachments: string[];
  scoreProcessId?: string;
  error?: string;
};

export type EmailPollResult = { received: number; queued: number; needsAssignment: number; errors: string[] };

export function startEmailPolling(): () => void {
  ensureEmailPolling();
  return () => {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = undefined;
  };
}

export function ensureEmailPolling(): void {
  if (pollingTimer || process.env.QQ_MAIL_ENABLED?.toLowerCase() !== "true" || !process.env.QQ_MAIL_ADDRESS || !process.env.QQ_MAIL_AUTH_CODE) return;
  const interval = Math.max(60, Number.parseInt(process.env.QQ_MAIL_POLL_SECONDS ?? "120", 10) || 120);
  void pollMailbox().catch((error: unknown) => console.error("QQ 邮箱自动收取失败：", error));
  pollingTimer = setInterval(() => {
    void pollMailbox().catch((error: unknown) => console.error("QQ 邮箱自动收取失败：", error));
  }, interval * 1000);
  pollingTimer.unref();
}

export function restartEmailPolling(): void {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = undefined;
  ensureEmailPolling();
}

export async function testQqMailbox(address: string, authCode: string): Promise<void> {
  const client = createClient(address, authCode);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function pollMailbox(): Promise<EmailPollResult> {
  if (pollInFlight) return pollInFlight;
  const address = process.env.QQ_MAIL_ADDRESS?.trim();
  const authCode = process.env.QQ_MAIL_AUTH_CODE;
  if (!address || !authCode) throw new Error("请先在设置中配置 QQ 邮箱地址和客户端授权码。");
  pollInFlight = pollMailboxInternal(address, authCode).finally(() => { pollInFlight = undefined; });
  return pollInFlight;
}

export async function listEmailInbox(): Promise<EmailInboxItem[]> {
  return readInbox();
}

export async function findSenderEmailForAttachment(jobId: string, documentName: string): Promise<string | undefined> {
  const normalizedName = documentName.trim().toLocaleLowerCase();
  const items = await readInbox();
  for (const item of items) {
    if (item.jobId !== jobId || !item.attachmentNames.some((name) => name.trim().toLocaleLowerCase() === normalizedName)) continue;
    const address = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(item.from)?.[0];
    if (address) return address.toLowerCase();
  }
  return undefined;
}

export async function assignInboxItem(itemId: string, jobId: string): Promise<EmailInboxItem> {
  const items = await readInbox();
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new Error("未找到该邮件记录。");
  const item = items[index]!;
  if (item.status !== "needs_assignment") throw new Error("该邮件当前不需要分配岗位。");
  const job = (await listJobs()).find((entry) => entry.job.id === jobId)?.job;
  if (!job) throw new Error("所选岗位不存在或已归档。");
  const updated = await enqueueEmailAttachments({ ...item, jobId: job.id, jobTitle: job.title });
  items[index] = updated;
  await writeInbox(items);
  return updated;
}

async function pollMailboxInternal(address: string, authCode: string): Promise<EmailPollResult> {
  const result: EmailPollResult = { received: 0, queued: 0, needsAssignment: 0, errors: [] };
  const client = createClient(address, authCode);
  const items = await readInbox();
  const knownKeys = new Set(items.map((item) => item.messageKey));
  const cursor = await readCursor();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("QQ 邮箱收件箱无法打开。");
      const uidValidity = String(mailbox.uidValidity ?? "0");
      if (!cursor.uidValidity || cursor.uidValidity !== uidValidity) {
        const latestUid = Math.max(0, Number(mailbox.uidNext ?? 1) - 1);
        await saveLastUid(uidValidity, latestUid);
        return result;
      }
      const lastUid = cursor.uidValidity === uidValidity ? cursor.lastUid : 0;
      const range = lastUid > 0 ? `${lastUid + 1}:*` : "1:*";
      for await (const message of client.fetch(range, { uid: true, source: true, internalDate: true }, { uid: true })) {
        const uidKey = `${String(mailbox.uidValidity ?? "0")}:${message.uid}`;
        const parsed = await simpleParser(message.source ?? Buffer.alloc(0));
        const messageKey = parsed.messageId ? `message:${parsed.messageId}` : `qq:${address.toLowerCase()}:${uidKey}`;
        if (knownKeys.has(messageKey)) {
          await saveLastUid(uidValidity, message.uid);
          continue;
        }
        const names: string[] = [];
        const stored: string[] = [];
        const unsupportedNames: string[] = [];
        const oversizedNames: string[] = [];
        for (const [attachmentIndex, attachment] of parsed.attachments.entries()) {
          const fileName = path.basename(attachment.filename ?? `attachment-${attachmentIndex + 1}`);
          if (attachment.size > maxAttachmentBytes) {
            oversizedNames.push(fileName);
            continue;
          }
          if (!supportedAttachment.test(fileName)) {
            unsupportedNames.push(fileName);
            continue;
          }
          const storedName = `${randomUUID()}-${fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 140)}`;
          await mkdir(attachmentDirectory, { recursive: true });
          await writeFile(path.join(attachmentDirectory, storedName), attachment.content, { flag: "wx" });
          names.push(fileName);
          stored.push(storedName);
        }
        const subject = parsed.subject?.trim() ?? "（无主题）";
        const matches = matchJobsBySubject(subject, await listJobs());
        const item: EmailInboxItem = {
          id: randomUUID(), messageKey, messageId: parsed.messageId,
          subject, from: parsed.from?.text ?? "未知发件人",
          receivedAt: normalizeDate(parsed.date ?? message.internalDate),
            status: stored.length === 0 ? "ignored" : matches.length === 1 ? "queued" : "needs_assignment",
          jobId: matches.length === 1 ? matches[0]!.job.id : undefined,
          jobTitle: matches.length === 1 ? matches[0]!.job.title : undefined,
          attachmentNames: names, storedAttachments: stored,
          error: stored.length === 0 ? describeUnsupportedAttachments(parsed.attachments.length, unsupportedNames, oversizedNames) : undefined,
        };
        items.unshift(item);
        knownKeys.add(messageKey);
        result.received += 1;
        if (item.status === "queued") {
          try {
            const enqueued = await enqueueEmailAttachments(item);
            Object.assign(item, enqueued);
            result.queued += 1;
          } catch (error) {
            item.status = "failed";
            item.error = error instanceof Error ? error.message : String(error);
            result.errors.push(`${subject}: ${item.error}`);
          }
        } else if (item.status === "needs_assignment") result.needsAssignment += 1;
        await saveLastUid(uidValidity, message.uid);
        await writeInbox(items);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return result;
}

function describeUnsupportedAttachments(total: number, unsupportedNames: string[], oversizedNames: string[]): string {
  if (total === 0) return "邮件中没有检测到文件附件。请将简历作为 PDF、DOCX 或 TXT 文件直接附加后重新发送。";
  const reasons = [];
  if (unsupportedNames.length) reasons.push(`不支持的格式：${unsupportedNames.join("、")}`);
  if (oversizedNames.length) reasons.push(`超过 20 MB：${oversizedNames.join("、")}`);
  return `邮件有附件，但没有可处理的简历文件。${reasons.join("；") || "请检查附件格式和大小。"}`;
}

async function enqueueEmailAttachments(item: EmailInboxItem): Promise<EmailInboxItem> {
  if (!item.jobId) throw new Error("邮件尚未分配岗位。");
  const { job, standard } = await getConfirmedJobStandard(item.jobId);
  const files = await Promise.all(item.storedAttachments.map(async (storedName) => ({
    name: item.attachmentNames[item.storedAttachments.indexOf(storedName)] ?? storedName,
    data: (await readFile(path.join(attachmentDirectory, storedName))).toString("base64"),
  })));
  if (files.length === 0) throw new Error("邮件中没有可处理的简历附件。");
  const process = await createScoreProcess(job.id, job.title, standard, files, "email");
  await Promise.all(item.storedAttachments.map((storedName) => rm(path.join(attachmentDirectory, storedName), { force: true })));
  const queued = { ...item, status: "processing" as const, scoreProcessId: process.id, storedAttachments: [] };
  const items = await readInbox();
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) items[index] = queued;
  else items.unshift(queued);
  await writeInbox(items);
  void runScoreProcess(process, job, standard).then(async () => {
    const finished = await getScoreProcess(job.id, process.id);
    const failures = finished.files.filter((file) => file.status === "failed");
    await updateInboxItem(item.id, (current) => ({
      ...current,
      status: failures.length ? "failed" : "completed",
      error: failures.length ? failures.map((file) => `${file.fileName}: ${file.error ?? "处理失败"}`).join("；") : undefined,
    }));
  }).catch(async (error: unknown) => {
    await updateInboxItem(item.id, (current) => ({ ...current, status: "failed", error: error instanceof Error ? error.message : String(error) }));
  });
  return queued;
}

function matchJobsBySubject(subject: string, jobs: Awaited<ReturnType<typeof listJobs>>) {
  const normalized = subject.toLocaleLowerCase();
  return jobs.filter(({ job, standard }) => !job.archivedAt && job.status === "confirmed" && standard.status === "confirmed" && normalized.includes(job.title.toLocaleLowerCase()));
}

function createClient(address: string, authCode: string) {
  return new ImapFlow({
    host: "imap.qq.com", port: 993, secure: true,
    auth: { user: address.trim(), pass: authCode.trim() },
    logger: false,
  });
}

async function saveLastUid(uidValidity: string, uid: number): Promise<void> {
  const value = { uidValidity, lastUid: uid };
  await mkdir(path.dirname(inboxFile), { recursive: true });
  await writeFile(cursorFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readCursor(): Promise<{ uidValidity?: string; lastUid: number }> {
  return readFile(cursorFile, "utf8").then((text) => JSON.parse(text) as { uidValidity?: string; lastUid: number }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return { lastUid: 0 };
    throw error;
  });
}

function normalizeDate(value?: Date | string): string {
  if (!value) return new Date().toISOString();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

async function readInbox(): Promise<EmailInboxItem[]> {
  return readFile(inboxFile, "utf8").then((text) => JSON.parse(text) as EmailInboxItem[]).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

async function writeInbox(items: EmailInboxItem[]): Promise<void> {
  await mkdir(path.dirname(inboxFile), { recursive: true });
  const temporary = `${inboxFile}.tmp`;
  await writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await rename(temporary, inboxFile);
}

async function updateInboxItem(id: string, update: (current: EmailInboxItem) => EmailInboxItem): Promise<void> {
  const items = await readInbox();
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    items[index] = update(items[index]!);
    await writeInbox(items);
  }
}
