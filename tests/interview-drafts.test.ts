import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const originalDirectory = process.cwd();

afterEach(() => {
  process.chdir(originalDirectory);
  vi.resetModules();
});

it("uses resume or matching inbox email and restores manually saved draft values", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "interview-drafts-test-"));
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    await mkdir(path.join(temporaryDirectory, "data/mail"), { recursive: true });
    await writeFile(path.join(temporaryDirectory, "data/mail/inbox.json"), JSON.stringify([
      { id: "mail-1", jobId: "job-1", from: "Applicant <candidate@example.com>", attachmentNames: ["inbox-resume.pdf"] },
    ]));
    const drafts = await import("../src/jobs/interview-drafts.js");
    const template = await drafts.getInterviewEmailTemplate("job-1", "产品经理");
    expect(template).toMatchObject({ subject: "面试邀请 - 产品经理", interviewTime: "", location: "" });
    await drafts.saveInterviewEmailTemplate("job-1", { ...template, interviewTime: "9月28日 14:00", location: "珠海市香洲区" });
    await expect(drafts.getInterviewEmailTemplate("job-1", "产品经理")).resolves.toMatchObject({
      interviewTime: "9月28日 14:00",
      location: "珠海市香洲区",
    });
    const rows = await drafts.listInterviewDrafts("job-1", [
      { id: "candidate-1", name: "林女士", documentName: "inbox-resume.pdf", hrStage: "interview" },
      { id: "candidate-2", name: "王女士", documentName: "resume.pdf", hrStage: "interview", email: "resume@example.com" },
      { id: "candidate-3", name: "赵女士", documentName: "other.pdf", hrStage: "pending" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: "candidate@example.com", emailSource: "inbox" });
    expect(rows[1]).toMatchObject({ email: "resume@example.com", emailSource: "resume" });

    await drafts.saveInterviewDrafts("job-1", [{ candidateId: "candidate-1", email: "manual@example.com", subject: "邀请面试", body: "林女士，您好" }]);
    await expect(drafts.listInterviewDrafts("job-1", [{ id: "candidate-1", name: "林女士", documentName: "inbox-resume.pdf", hrStage: "interview" }])).resolves.toMatchObject([
      { email: "manual@example.com", emailSource: "manual", subject: "邀请面试", body: "林女士，您好" },
    ]);
    const saved = JSON.parse(await readFile(path.join(temporaryDirectory, "data/jobs/job-1/interview-drafts.json"), "utf8"));
    expect(saved["candidate-1"].email).toBe("manual@example.com");
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

it("sends individual messages, records failures, and prevents accidental duplicate sends", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "interview-send-test-"));
  const originalAddress = process.env.QQ_MAIL_ADDRESS;
  const originalAuthCode = process.env.QQ_MAIL_AUTH_CODE;
  process.env.QQ_MAIL_ADDRESS = "hr@qq.com";
  process.env.QQ_MAIL_AUTH_CODE = "test-auth-code";
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    const drafts = await import("../src/jobs/interview-drafts.js");
    await drafts.saveInterviewDrafts("job-1", [
      { candidateId: "candidate-1", email: "one@example.com", subject: "面试邀请", body: "第一封" },
      { candidateId: "candidate-2", email: "two@example.com", subject: "面试邀请", body: "第二封" },
    ]);
    const sentMessages: string[] = [];
    const results = await drafts.sendInterviewDrafts("job-1", ["candidate-1", "candidate-2"], async (message) => {
      sentMessages.push(message.to);
      if (message.to === "two@example.com") throw new Error("SMTP 暂时不可用");
    });

    expect(sentMessages).toEqual(["one@example.com", "two@example.com"]);
    expect(results.map((result) => result.success)).toEqual([true, false]);
    const persisted = await drafts.listInterviewDrafts("job-1", [
      { id: "candidate-1", name: "候选人一", documentName: "one.pdf", hrStage: "interview" },
      { id: "candidate-2", name: "候选人二", documentName: "two.pdf", hrStage: "interview" },
    ]);
    expect(persisted[0]?.sentAt).toBeTruthy();
    expect(persisted[0]?.sendStatus).toBe("sent");
    expect(persisted[1]?.lastSendError).toBe("SMTP 暂时不可用");
    expect(persisted[1]?.sendStatus).toBe("failed");

    const retryResult = await drafts.sendInterviewDrafts("job-1", ["candidate-2"], async () => undefined);
    expect(retryResult[0]?.success).toBe(true);
    const retryRecord = await drafts.listInterviewDrafts("job-1", [
      { id: "candidate-2", name: "候选人二", documentName: "two.pdf", hrStage: "interview" },
    ]);
    expect(retryRecord[0]).toMatchObject({ sendStatus: "sent", lastSendError: undefined });

    const repeatResult = await drafts.sendInterviewDrafts("job-1", ["candidate-1"], async () => {
      throw new Error("已发送的邮件不得重发");
    });
    expect(repeatResult[0]).toMatchObject({ success: false, error: "该候选人的邀请邮件已发送，已跳过以避免重复发送。" });
  } finally {
    process.chdir(originalDirectory);
    if (originalAddress === undefined) delete process.env.QQ_MAIL_ADDRESS;
    else process.env.QQ_MAIL_ADDRESS = originalAddress;
    if (originalAuthCode === undefined) delete process.env.QQ_MAIL_AUTH_CODE;
    else process.env.QQ_MAIL_AUTH_CODE = originalAuthCode;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

it("requires verification before retrying a send interrupted by an app restart", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "interview-unknown-send-test-"));
  const originalAddress = process.env.QQ_MAIL_ADDRESS;
  const originalAuthCode = process.env.QQ_MAIL_AUTH_CODE;
  process.env.QQ_MAIL_ADDRESS = "hr@qq.com";
  process.env.QQ_MAIL_AUTH_CODE = "test-auth-code";
  process.chdir(temporaryDirectory);
  vi.resetModules();
  try {
    const draftDirectory = path.join(temporaryDirectory, "data/jobs/job-1");
    await mkdir(draftDirectory, { recursive: true });
    await writeFile(path.join(draftDirectory, "interview-drafts.json"), JSON.stringify({
      "candidate-1": {
        email: "one@example.com",
        subject: "面试邀请",
        body: "候选人一，您好",
        sendStatus: "sending",
        lastSendAttemptAt: "2026-09-25T02:00:00.000Z",
      },
    }));

    const drafts = await import("../src/jobs/interview-drafts.js");
    const candidate = { id: "candidate-1", name: "候选人一", documentName: "one.pdf", hrStage: "interview" };
    const restored = await drafts.listInterviewDrafts("job-1", [candidate]);
    expect(restored[0]?.sendStatus).toBe("unknown");

    const sendMessage = vi.fn(async () => undefined);
    const blocked = await drafts.sendInterviewDrafts("job-1", ["candidate-1"], sendMessage);
    expect(blocked[0]?.success).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();

    await drafts.confirmInterviewDraftNotSent("job-1", "candidate-1");
    const unlocked = await drafts.listInterviewDrafts("job-1", [candidate]);
    expect(unlocked[0]?.sendStatus).toBeUndefined();
    const retried = await drafts.sendInterviewDrafts("job-1", ["candidate-1"], sendMessage);
    expect(retried[0]?.success).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  } finally {
    process.chdir(originalDirectory);
    if (originalAddress === undefined) delete process.env.QQ_MAIL_ADDRESS;
    else process.env.QQ_MAIL_ADDRESS = originalAddress;
    if (originalAuthCode === undefined) delete process.env.QQ_MAIL_AUTH_CODE;
    else process.env.QQ_MAIL_AUTH_CODE = originalAuthCode;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
