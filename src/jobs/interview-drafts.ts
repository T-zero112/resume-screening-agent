import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createTransport } from "nodemailer";

import { findSenderEmailForAttachment } from "../mail/email-inbox.js";

export type InterviewDraft = {
  candidateId: string;
  name: string;
  documentName: string;
  email: string;
  emailSource: "manual" | "resume" | "inbox" | "missing";
  subject: string;
  body: string;
  updatedAt?: string;
  sendStatus?: "sending" | "sent" | "failed" | "unknown";
  lastSendAttemptAt?: string;
  sentAt?: string;
  lastSendError?: string;
};

export type InterviewEmailTemplate = {
  subject: string;
  opening: string;
  interviewTime: string;
  location: string;
  format: string;
  additionalInfo: string;
  closing: string;
  updatedAt?: string;
};

type StoredDraft = Pick<InterviewDraft, "email" | "subject" | "body" | "updatedAt" | "sendStatus" | "lastSendAttemptAt" | "sentAt" | "lastSendError">;

export type InterviewSendResult = { candidateId: string; success: boolean; sentAt?: string; error?: string };
const draftLocks = new Map<string, Promise<void>>();

export async function listInterviewDrafts(jobId: string, candidates: Array<Record<string, unknown>>): Promise<InterviewDraft[]> {
  const stored = await withDraftLock(jobId, async () => {
    const drafts = await readDrafts(jobId);
    let changed = false;
    for (const [candidateId, draft] of Object.entries(drafts)) {
      if (draft.sendStatus === "sending") {
        drafts[candidateId] = {
          ...draft,
          sendStatus: "unknown",
          lastSendError: "发送过程中程序中断，无法确认邮件是否已到达。请先核对邮箱的已发送邮件；确认未发送后再解锁重试。",
        };
        changed = true;
      }
    }
    if (changed) await writeStore(storePath(jobId), drafts);
    return drafts;
  });
  const interviewCandidates = candidates.filter((candidate) => candidate.hrStage === "interview");
  return Promise.all(interviewCandidates.map(async (candidate) => {
    const candidateId = String(candidate.id);
    const documentName = String(candidate.documentName ?? "");
    const previous = stored[candidateId];
    const profileEmail = typeof candidate.email === "string" ? candidate.email : "";
    const inboxEmail = profileEmail ? undefined : await findSenderEmailForAttachment(jobId, documentName);
    const email = previous?.email ?? (profileEmail || inboxEmail || "");
    return {
      candidateId,
      name: String(candidate.name ?? "未命名候选人"),
      documentName,
      email,
      emailSource: previous ? "manual" : profileEmail ? "resume" : inboxEmail ? "inbox" : "missing",
      subject: previous?.subject ?? "面试邀请",
      body: previous?.body ?? "",
      updatedAt: previous?.updatedAt,
      sendStatus: previous?.sentAt ? "sent" : previous?.sendStatus ?? (previous?.lastSendError ? "failed" : undefined),
      lastSendAttemptAt: previous?.lastSendAttemptAt,
      sentAt: previous?.sentAt,
      lastSendError: previous?.lastSendError,
    };
  }));
}

export async function getInterviewEmailTemplate(jobId: string, jobTitle: string): Promise<InterviewEmailTemplate> {
  assertSafeJobId(jobId);
  return readFile(templatePath(jobId), "utf8")
    .then((text) => JSON.parse(text) as InterviewEmailTemplate)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return {
        subject: `面试邀请 - ${jobTitle}`,
        opening: `感谢您应聘${jobTitle}。我们希望邀请您参加面试。`,
        interviewTime: "",
        location: "",
        format: "",
        additionalInfo: "",
        closing: "请回复确认是否参加。\n\nHR",
      };
    });
}

export async function saveInterviewEmailTemplate(jobId: string, template: InterviewEmailTemplate): Promise<void> {
  assertSafeJobId(jobId);
  await withDraftLock(jobId, async () => {
    const file = templatePath(jobId);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ ...template, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
    await rename(temporary, file);
  });
}

export async function saveInterviewDrafts(jobId: string, drafts: Array<Pick<InterviewDraft, "candidateId" | "email" | "subject" | "body">>): Promise<void> {
  assertSafeJobId(jobId);
  await withDraftLock(jobId, async () => {
    const file = storePath(jobId);
    const store = await readDrafts(jobId);
    for (const draft of drafts) {
      store[draft.candidateId] = {
        ...store[draft.candidateId],
        email: draft.email.trim(),
        subject: draft.subject.trim(),
        body: draft.body,
        updatedAt: new Date().toISOString(),
      };
    }
    await writeStore(file, store);
  });
}

export async function sendInterviewDrafts(
  jobId: string,
  candidateIds: string[],
  sendMessage?: (message: { to: string; subject: string; text: string }) => Promise<void>,
): Promise<InterviewSendResult[]> {
  assertSafeJobId(jobId);
  const address = process.env.QQ_MAIL_ADDRESS?.trim();
  const authCode = process.env.QQ_MAIL_AUTH_CODE?.trim();
  if (!address || !authCode) throw new Error("请先在设置中配置 QQ 邮箱地址和客户端授权码，再发送面试邮件。");

  return withDraftLock(jobId, async () => {
    const transport = sendMessage ? undefined : createTransport({
      host: "smtp.qq.com",
      port: 465,
      secure: true,
      auth: { user: address, pass: authCode },
    });
    const send = sendMessage ?? (async (message: { to: string; subject: string; text: string }) => {
      await transport!.sendMail({ from: address, ...message });
    });
    const store = await readDrafts(jobId);
    const results: InterviewSendResult[] = [];

    try {
      for (const candidateId of [...new Set(candidateIds)]) {
        const draft = store[candidateId];
        if (!draft) {
          results.push({ candidateId, success: false, error: "没有找到已保存的邮件草稿。" });
          continue;
        }
        if (draft.sentAt || draft.sendStatus === "sent") {
          store[candidateId] = { ...draft, sendStatus: "sent" };
          results.push({ candidateId, success: false, sentAt: draft.sentAt, error: "该候选人的邀请邮件已发送，已跳过以避免重复发送。" });
          continue;
        }
        if (draft.sendStatus === "sending" || draft.sendStatus === "unknown") {
          results.push({ candidateId, success: false, error: "发送状态待核实。请先检查邮箱的已发送邮件，确认未发送后再解锁重试。" });
          continue;
        }
        if (!isValidEmail(draft.email) || !draft.subject.trim() || !draft.body.trim()) {
          results.push({ candidateId, success: false, error: "请检查邮箱、邮件主题和邮件正文。" });
          continue;
        }
        const lastSendAttemptAt = new Date().toISOString();
        store[candidateId] = { ...draft, sendStatus: "sending", lastSendAttemptAt, lastSendError: undefined };
        await writeStore(storePath(jobId), store);
        try {
          await send({ to: draft.email.trim(), subject: draft.subject.trim(), text: draft.body });
          const sentAt = new Date().toISOString();
          store[candidateId] = { ...draft, sendStatus: "sent", lastSendAttemptAt, sentAt, lastSendError: undefined };
          results.push({ candidateId, success: true, sentAt });
        } catch (error) {
          const message = error instanceof Error ? error.message : "邮件发送失败。";
          store[candidateId] = { ...draft, sendStatus: "failed", lastSendAttemptAt, lastSendError: message };
          results.push({ candidateId, success: false, error: message });
        }
        await writeStore(storePath(jobId), store);
      }
    } finally {
      transport?.close();
    }
    return results;
  });
}

export async function confirmInterviewDraftNotSent(jobId: string, candidateId: string): Promise<void> {
  assertSafeJobId(jobId);
  await withDraftLock(jobId, async () => {
    const store = await readDrafts(jobId);
    const draft = store[candidateId];
    if (!draft || (draft.sendStatus !== "unknown" && draft.sendStatus !== "sending")) {
      throw new Error("该邮件没有待核实的发送状态。");
    }
    store[candidateId] = { ...draft, sendStatus: undefined, lastSendAttemptAt: undefined, lastSendError: undefined };
    await writeStore(storePath(jobId), store);
  });
}

async function writeStore(file: string, store: Record<string, StoredDraft>): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

async function withDraftLock<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
  const previous = draftLocks.get(jobId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  draftLocks.set(jobId, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (draftLocks.get(jobId) === current) draftLocks.delete(jobId);
  }
}

async function readDrafts(jobId: string): Promise<Record<string, StoredDraft>> {
  assertSafeJobId(jobId);
  return readFile(storePath(jobId), "utf8").then((text) => JSON.parse(text) as Record<string, StoredDraft>).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
}

function storePath(jobId: string): string {
  return path.join(path.resolve("data/jobs"), jobId, "interview-drafts.json");
}

function templatePath(jobId: string): string {
  return path.join(path.resolve("data/jobs"), jobId, "interview-email-template.json");
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(jobId)) throw new Error("岗位编号无效。");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
