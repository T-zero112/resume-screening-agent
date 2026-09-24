import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { z } from "zod";

import { archiveJob, confirmDraft, createJobDraft, createStandardRevision, getConfirmedJobStandard, getConfirmedJobStandardVersion, getJobDraft, getLatestJobDraft, listJobs, restoreJob, saveDraft } from "./job-store.js";
import { generateScoreStandard } from "./score-standard-generator.js";
import { createScoreProcess, getScoreProcess, listScoreProcesses, queueFailedScoreFilesRetry, queueScoreProcessResume, requestScoreProcessPause, runScoreProcess } from "./score-process.js";
import { getLlmUsageStats, getUsdCnyRate } from "../observability/llm-usage.js";
import { assignInboxItem, listEmailInbox, pollMailbox, restartEmailPolling, startEmailPolling, testQqMailbox } from "../mail/email-inbox.js";
import { getResumeArchiveSettings, saveResumeArchiveSettings, selectWindowsArchiveDirectory, startArchiveRetention } from "../mail/resume-archive.js";
import { readCandidateStages, updateCandidateStage, type CandidateStage } from "./candidate-workflow.js";
import { confirmInterviewDraftNotSent, getInterviewEmailTemplate, listInterviewDrafts, saveInterviewDrafts, saveInterviewEmailTemplate, sendInterviewDrafts } from "./interview-drafts.js";
import { generateDimensionGuidance } from "./dimension-guidance-generator.js";
import { ensureResumePhoto } from "../parsing/resume-photo.js";

const GenerateRequestSchema = z.object({ title: z.string().trim().min(1), jdText: z.string().trim().min(1) });
const StandardRequestSchema = z.object({ jobId: z.string().min(1), standard: z.unknown() });
const UploadScoreRequestSchema = z.object({ jobId: z.string().min(1), files: z.array(z.object({ name: z.string().min(1), data: z.string().min(1) })).min(1).max(50) });
const ScoreProcessControlSchema = z.object({ jobId: z.string().min(1), processId: z.string().uuid(), action: z.enum(["pause", "resume"]) });
const RetryScoreFilesSchema = z.object({ jobId: z.string().min(1), processId: z.string().uuid(), fileIds: z.array(z.string().uuid()).min(1).max(50) });
const LlmSettingsSchema = z.object({
  provider: z.enum(["openai", "deepseek", "custom"]),
  model: z.string().trim().min(1).max(200),
  baseURL: z.string().trim().max(1000).optional().default(""),
  apiKey: z.string().max(2000).optional().default(""),
  langSmithTracing: z.boolean(),
  langSmithEndpoint: z.string().trim().max(1000).optional().default(""),
  langSmithProject: z.string().trim().min(1).max(200),
  langSmithApiKey: z.string().max(2000).optional().default(""),
});
const QqMailSettingsSchema = z.object({ address: z.string().trim().email(), authCode: z.string().trim().max(500).optional().default(""), enabled: z.boolean() });
const ResumeArchiveSettingsSchema = z.object({ enabled: z.boolean(), directory: z.string().max(2000), retentionDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]) });
const CandidateStageSchema = z.object({ jobId: z.string().min(1), candidateId: z.string().min(1).max(200), stage: z.enum(["interview", "pending", "rejected"]).nullable() });
const InterviewDraftsSchema = z.object({
  jobId: z.string().min(1),
  drafts: z.array(z.object({
    candidateId: z.string().min(1).max(200),
    email: z.union([z.literal(""), z.string().trim().email()]),
    subject: z.string().max(500),
    body: z.string().max(20000),
  })).min(1).max(100),
});
const SendInterviewDraftsSchema = z.object({ jobId: z.string().min(1), candidateIds: z.array(z.string().min(1).max(200)).min(1).max(100) });
const ConfirmInterviewNotSentSchema = z.object({ jobId: z.string().min(1), candidateId: z.string().min(1).max(200) });
const InterviewEmailTemplateSchema = z.object({
  jobId: z.string().min(1),
  template: z.object({
    subject: z.string().max(500),
    opening: z.string().max(5000),
    interviewTime: z.string().max(500),
    location: z.string().max(1000),
    format: z.string().max(500),
    additionalInfo: z.string().max(5000),
    closing: z.string().max(5000),
  }),
});
const DimensionGuidanceRequestSchema = z.object({ jobId: z.string().min(1), dimensionName: z.string().trim().min(1).max(200) });
const RevealKeySchema = z.object({ kind: z.enum(["llm", "langsmith", "qq-mail"]) });
const supportedExtensions = new Set([".pdf", ".docx", ".txt"]);

export function jobApiPlugin(): Plugin {
  return {
    name: "local-job-api",
    configureServer(server) {
      server.middlewares.use(createJobApiMiddleware());
      const stopPolling = startEmailPolling();
      const stopArchiveRetention = startArchiveRetention();
      server.httpServer?.once("close", stopPolling);
      server.httpServer?.once("close", stopArchiveRetention);
    },
  };
}

export function createJobApiMiddleware(options: { storeSecrets?: (secrets: Record<string, string>) => Promise<void> } = {}) {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: Error) => void) => {
    if (!request.url?.startsWith("/api/")) return next();
    try {
          if (request.method === "GET" && request.url?.startsWith("/api/usage")) {
            const period = z.enum(["7d", "30d", "all"]).parse(new URL(request.url, "http://localhost").searchParams.get("period") ?? "30d");
            const [stats, exchangeRate] = await Promise.all([getLlmUsageStats(period), getUsdCnyRate()]);
            return sendJson(response, 200, { ...stats, exchangeRate });
          }

          if (request.method === "GET" && request.url === "/api/jobs/latest") {
            return sendJson(response, 200, await getLatestJobDraft());
          }

          if (request.method === "GET" && request.url === "/api/settings") {
            const provider = resolveConfiguredProvider();
            return sendJson(response, 200, {
              provider,
              model: process.env.LLM_MODEL ?? (provider === "deepseek" ? process.env.DEEPSEEK_MODEL : process.env.OPENAI_MODEL) ?? (provider === "deepseek" ? "deepseek-flash" : "gpt-6-astra"),
              baseURL: process.env.LLM_BASE_URL ?? (provider === "deepseek" ? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com" : process.env.OPENAI_BASE_URL ?? ""),
              hasApiKey: Boolean(process.env.LLM_API_KEY ?? (provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : undefined) ?? process.env.OPENAI_API_KEY),
              langSmithTracing: process.env.LANGSMITH_TRACING?.toLowerCase() === "true",
              langSmithEndpoint: process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com",
              langSmithProject: process.env.LANGSMITH_PROJECT ?? "resume-screening",
              hasLangSmithApiKey: Boolean(process.env.LANGSMITH_API_KEY),
              qqMailAddress: process.env.QQ_MAIL_ADDRESS ?? "",
              hasQqMailAuthCode: Boolean(process.env.QQ_MAIL_AUTH_CODE),
              qqMailEnabled: process.env.QQ_MAIL_ENABLED?.toLowerCase() === "true",
            });
          }

          if (request.method === "GET" && request.url === "/api/archive/settings") {
            return sendJson(response, 200, await getResumeArchiveSettings());
          }

          if (request.method === "PUT" && request.url === "/api/archive/settings") {
            const settings = ResumeArchiveSettingsSchema.parse(await readJsonBody(request));
            return sendJson(response, 200, await saveResumeArchiveSettings(settings));
          }

          if (request.method === "POST" && request.url === "/api/archive/select-directory") {
            assertLocalBrowserRequest(request);
            const directory = await selectWindowsArchiveDirectory();
            return sendJson(response, 200, { directory: directory ?? null });
          }

          if (request.method === "POST" && request.url === "/api/settings/reveal-key") {
            const { kind } = RevealKeySchema.parse(await readJsonBody(request));
            const key = kind === "langsmith"
              ? process.env.LANGSMITH_API_KEY ?? ""
              : kind === "qq-mail"
                ? process.env.QQ_MAIL_AUTH_CODE ?? ""
                : process.env.LLM_API_KEY ?? (resolveConfiguredProvider() === "deepseek" ? process.env.DEEPSEEK_API_KEY : undefined) ?? process.env.OPENAI_API_KEY ?? "";
            if (!key) throw new Error("该 API Key 尚未配置。");
            return sendJson(response, 200, { key });
          }

          if (request.method === "PUT" && request.url === "/api/settings") {
            const settings = LlmSettingsSchema.parse(await readJsonBody(request));
            for (const [label, value] of [["模型接口地址", settings.baseURL], ["LangSmith 接口地址", settings.langSmithEndpoint]] as const) {
              if (!value) continue;
              const parsedUrl = new URL(value);
              if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error(`${label}必须使用 HTTP 或 HTTPS。`);
            }
            const updates: Record<string, string> = {
              LLM_PROVIDER: settings.provider,
              LLM_MODEL: settings.model,
              LLM_BASE_URL: settings.baseURL,
              LANGSMITH_TRACING: String(settings.langSmithTracing),
              LANGSMITH_ENDPOINT: settings.langSmithEndpoint,
              LANGSMITH_PROJECT: settings.langSmithProject,
            };
            const secrets: Record<string, string> = {};
            if (settings.apiKey.trim()) {
              if (options.storeSecrets) secrets.LLM_API_KEY = settings.apiKey.trim();
              else updates.LLM_API_KEY = settings.apiKey.trim();
            }
            if (settings.langSmithApiKey.trim()) {
              if (options.storeSecrets) secrets.LANGSMITH_API_KEY = settings.langSmithApiKey.trim();
              else updates.LANGSMITH_API_KEY = settings.langSmithApiKey.trim();
            }
            await updateEnvFile(updates);
            if (Object.keys(secrets).length) await options.storeSecrets?.(secrets);
            for (const [key, value] of Object.entries(updates)) process.env[key] = value;
            return sendJson(response, 200, { saved: true, hasApiKey: Boolean(process.env.LLM_API_KEY), hasLangSmithApiKey: Boolean(process.env.LANGSMITH_API_KEY) });
          }

          if (request.method === "PUT" && request.url === "/api/settings/qq-mail") {
            const settings = QqMailSettingsSchema.parse(await readJsonBody(request));
            const authCode = settings.authCode || process.env.QQ_MAIL_AUTH_CODE || "";
            if (!authCode) throw new Error("请输入 QQ 邮箱客户端授权码。");
            await testQqMailbox(settings.address, authCode);
            const values = {
              QQ_MAIL_ADDRESS: settings.address,
              QQ_MAIL_ENABLED: String(settings.enabled),
            };
            const secrets = { ...values, QQ_MAIL_AUTH_CODE: authCode };
            if (options.storeSecrets) await options.storeSecrets(secrets);
            else await updateEnvFile(secrets);
            Object.assign(process.env, secrets);
            restartEmailPolling();
            return sendJson(response, 200, { saved: true, address: settings.address, hasAuthCode: true, enabled: settings.enabled });
          }

          if (request.method === "GET" && request.url === "/api/email/inbox") {
            return sendJson(response, 200, await listEmailInbox());
          }

          if (request.method === "POST" && request.url === "/api/email/poll") {
            return sendJson(response, 200, await pollMailbox());
          }

          if (request.method === "POST" && request.url === "/api/email/assign") {
            const body = z.object({ itemId: z.string().uuid(), jobId: z.string().min(1) }).parse(await readJsonBody(request));
            return sendJson(response, 202, await assignInboxItem(body.itemId, body.jobId));
          }

          if (request.method === "GET" && request.url === "/api/jobs") {
            const jobs = await listJobs();
            return sendJson(response, 200, await Promise.all(jobs.map(async (entry) => ({
              ...entry,
              candidateCount: (await listJobCandidates(entry.job.id)).length,
            }))));
          }

          if (request.method === "GET" && request.url === "/api/jobs/archived") {
            const jobs = await listJobs(true);
            return sendJson(response, 200, await Promise.all(jobs.filter((entry) => entry.job.archivedAt).map(async (entry) => ({
              ...entry,
              candidateCount: (await listJobCandidates(entry.job.id)).length,
            }))));
          }

          if (request.method === "GET" && request.url?.startsWith("/api/jobs/candidate-photo")) {
            assertLocalBrowserRequest(request);
            const url = new URL(request.url, "http://localhost");
            const jobId = url.searchParams.get("jobId");
            const candidateId = url.searchParams.get("candidateId");
            if (!jobId || !candidateId) throw new Error("缺少岗位或候选人编号。");
            const candidate = (await listJobCandidates(jobId)).find((item) => item.id === candidateId);
            const photoPath = candidate?.photoPath;
            if (typeof photoPath !== "string") {
              response.statusCode = 404;
              return response.end();
            }
            const extension = path.extname(photoPath).toLowerCase();
            response.statusCode = 200;
            response.setHeader("Content-Type", extension === ".png" ? "image/png" : "image/jpeg");
            response.setHeader("Cache-Control", "no-store");
            return response.end(await readFile(photoPath));
          }

          if (request.method === "POST" && request.url && /^\/api\/jobs\/[^/]+\/restore$/.test(new URL(request.url, "http://localhost").pathname)) {
            const jobId = decodeURIComponent(new URL(request.url, "http://localhost").pathname.slice("/api/jobs/".length, -"/restore".length));
            return sendJson(response, 200, { job: await restoreJob(jobId) });
          }

          if (request.method === "DELETE" && request.url && /^\/api\/jobs\/[^/]+$/.test(new URL(request.url, "http://localhost").pathname)) {
            const jobId = decodeURIComponent(new URL(request.url, "http://localhost").pathname.slice("/api/jobs/".length));
            const processes = await listScoreProcesses(jobId);
            if (processes.some((process) => ["queued", "processing", "paused"].includes(process.status))) {
              throw new Error("该岗位有未结束的评分进程，请先完成或处理评分进程。");
            }
            return sendJson(response, 200, { job: await archiveJob(jobId) });
          }

          if (request.method === "GET" && request.url && /^\/api\/jobs\/[^/]+$/.test(new URL(request.url, "http://localhost").pathname) && !request.url.startsWith("/api/jobs/latest") && !request.url.startsWith("/api/jobs/candidates") && !request.url.startsWith("/api/jobs/interview-drafts") && !request.url.startsWith("/api/jobs/interview-template") && !request.url.startsWith("/api/jobs/score-processes")) {
            const jobId = decodeURIComponent(new URL(request.url, "http://localhost").pathname.slice("/api/jobs/".length));
            return sendJson(response, 200, await getJobDraft(jobId));
          }

          if (request.method === "GET" && request.url?.startsWith("/api/jobs/candidates")) {
            const jobId = new URL(request.url, "http://localhost").searchParams.get("jobId");
            if (!jobId) throw new Error("缺少岗位编号。");
            const candidates = await listJobCandidates(jobId);
            return sendJson(response, 200, candidates.map(({ photoPath: _photoPath, ...candidate }) => candidate));
          }

          if (request.method === "PUT" && request.url === "/api/jobs/candidate-stage") {
            const body = CandidateStageSchema.parse(await readJsonBody(request));
            const candidates = await listJobCandidates(body.jobId);
            if (!candidates.some((candidate) => candidate.id === body.candidateId)) throw new Error("未找到该岗位下的候选人。");
            await updateCandidateStage(body.jobId, body.candidateId, body.stage as CandidateStage | null);
            return sendJson(response, 200, { candidateId: body.candidateId, stage: body.stage });
          }

          if (request.method === "GET" && request.url?.startsWith("/api/jobs/interview-drafts")) {
            const jobId = new URL(request.url, "http://localhost").searchParams.get("jobId");
            if (!jobId) throw new Error("缺少岗位编号。");
            return sendJson(response, 200, await listInterviewDrafts(jobId, await listJobCandidates(jobId)));
          }

          if (request.method === "GET" && request.url?.startsWith("/api/jobs/interview-template")) {
            const jobId = new URL(request.url, "http://localhost").searchParams.get("jobId");
            if (!jobId) throw new Error("缺少岗位编号。");
            const { job } = await getJobDraft(jobId);
            return sendJson(response, 200, await getInterviewEmailTemplate(jobId, job.title));
          }

          if (request.method === "PUT" && request.url === "/api/jobs/interview-template") {
            const body = InterviewEmailTemplateSchema.parse(await readJsonBody(request));
            await saveInterviewEmailTemplate(body.jobId, body.template);
            return sendJson(response, 200, { saved: true });
          }

          if (request.method === "PUT" && request.url === "/api/jobs/interview-drafts") {
            const body = InterviewDraftsSchema.parse(await readJsonBody(request));
            const candidates = await listJobCandidates(body.jobId);
            const interviewIds = new Set(candidates.filter((candidate) => candidate.hrStage === "interview").map((candidate) => String(candidate.id)));
            if (body.drafts.some((draft) => !interviewIds.has(draft.candidateId))) throw new Error("草稿只能为已标记面试的候选人保存。");
            await saveInterviewDrafts(body.jobId, body.drafts);
            return sendJson(response, 200, { saved: body.drafts.length });
          }

          if (request.method === "POST" && request.url === "/api/jobs/send-interview-drafts") {
            const body = SendInterviewDraftsSchema.parse(await readJsonBody(request));
            const candidates = await listJobCandidates(body.jobId);
            const interviewIds = new Set(candidates.filter((candidate) => candidate.hrStage === "interview").map((candidate) => String(candidate.id)));
            if (body.candidateIds.some((candidateId) => !interviewIds.has(candidateId))) throw new Error("只能发送给已标记面试的候选人。");
            const results = await sendInterviewDrafts(body.jobId, body.candidateIds);
            return sendJson(response, 200, { results });
          }

          if (request.method === "POST" && request.url === "/api/jobs/interview-drafts/confirm-not-sent") {
            const body = ConfirmInterviewNotSentSchema.parse(await readJsonBody(request));
            const candidates = await listJobCandidates(body.jobId);
            const isInterviewCandidate = candidates.some((candidate) => candidate.id === body.candidateId && candidate.hrStage === "interview");
            if (!isInterviewCandidate) throw new Error("只能为已标记面试的候选人核实邮件状态。");
            await confirmInterviewDraftNotSent(body.jobId, body.candidateId);
            return sendJson(response, 200, { candidateId: body.candidateId, sendStatus: "draft" });
          }

          if (request.method === "GET" && request.url?.startsWith("/api/jobs/score-processes")) {
            const jobId = new URL(request.url, "http://localhost").searchParams.get("jobId");
            if (!jobId) throw new Error("缺少岗位编号。");
            return sendJson(response, 200, await listScoreProcesses(jobId));
          }

          if (request.method === "POST" && request.url === "/api/jobs/control-score-process") {
            const body = ScoreProcessControlSchema.parse(await readJsonBody(request));
            if (body.action === "pause") {
              return sendJson(response, 200, await requestScoreProcessPause(body.jobId, body.processId));
            }
            const process = await getScoreProcess(body.jobId, body.processId);
            const { job, standard } = await getConfirmedJobStandardVersion(body.jobId, process.scoreStandardVersion);
            const queuedProcess = await queueScoreProcessResume(body.jobId, body.processId);
            void runScoreProcess(queuedProcess, job, standard).catch((error: unknown) => {
              console.error(`Score process ${queuedProcess.id} stopped unexpectedly:`, error);
            });
            return sendJson(response, 200, queuedProcess);
          }

          if (request.method === "POST" && request.url === "/api/jobs/retry-score-files") {
            const body = RetryScoreFilesSchema.parse(await readJsonBody(request));
            const process = await getScoreProcess(body.jobId, body.processId);
            const { job, standard } = await getConfirmedJobStandardVersion(body.jobId, process.scoreStandardVersion);
            const queuedProcess = await queueFailedScoreFilesRetry(body.jobId, body.processId, body.fileIds);
            void runScoreProcess(queuedProcess, job, standard).catch((error: unknown) => {
              console.error(`Score process ${queuedProcess.id} retry batch stopped unexpectedly:`, error);
            });
            return sendJson(response, 202, queuedProcess);
          }

          if (request.method === "POST" && request.url === "/api/jobs/start-scoring") {
            const body = UploadScoreRequestSchema.parse(await readJsonBody(request));
            const { job, standard } = await getConfirmedJobStandard(body.jobId);
            const process = await createScoreProcess(job.id, job.title, standard, body.files);
            void runScoreProcess(process, job, standard).catch((error: unknown) => {
              console.error(`Score process ${process.id} stopped unexpectedly:`, error);
            });
            response.statusCode = 202;
            return sendJson(response, 202, process);
          }

          if (request.method === "POST" && request.url === "/api/jobs/generate-standard") {
            const body = GenerateRequestSchema.parse(await readJsonBody(request));
            const now = Date.now();
            const jobId = `job-${now.toString(36)}`;
            const standard = await generateScoreStandard({ jobId, jdText: body.jdText, version: 1 });
            const job = await createJobDraft({ ...body, standard });
            return sendJson(response, 201, { job, standard });
          }

          if (request.method === "POST" && request.url === "/api/jobs/generate-dimension-guidance") {
            const body = DimensionGuidanceRequestSchema.parse(await readJsonBody(request));
            const { job, standard } = await getJobDraft(body.jobId);
            if (standard.status !== "draft") throw new Error("只有评分标准草稿可以生成或调整维度依据。");
            const guidance = await generateDimensionGuidance({ jdText: job.jdText, dimensionName: body.dimensionName });
            return sendJson(response, 200, { guidance });
          }

          if (request.method === "PUT" && request.url === "/api/jobs/save-standard-draft") {
            const body = StandardRequestSchema.parse(await readJsonBody(request));
            const standard = await saveDraft(body.jobId, body.standard);
            return sendJson(response, 200, { standard });
          }

          if (request.method === "POST" && request.url === "/api/jobs/create-standard-revision") {
            const body = z.object({ jobId: z.string().min(1) }).parse(await readJsonBody(request));
            const standard = await createStandardRevision(body.jobId);
            return sendJson(response, 201, { standard });
          }

          if (request.method === "POST" && request.url === "/api/jobs/confirm-standard") {
            const body = StandardRequestSchema.parse(await readJsonBody(request));
            const result = await confirmDraft(body.jobId, body.standard);
            return sendJson(response, 200, result);
          }

          return sendJson(response, 404, { error: "未找到本地岗位接口。" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "岗位操作失败。";
      return sendJson(response, 400, { error: message });
    }
  };
}

function resolveConfiguredProvider(): "openai" | "deepseek" | "custom" {
  const configured = process.env.LLM_PROVIDER?.toLowerCase();
  if (configured === "openai" || configured === "deepseek" || configured === "custom") return configured;
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.LLM_BASE_URL) return "custom";
  return "openai";
}

async function updateEnvFile(updates: Record<string, string>): Promise<void> {
  const file = path.resolve(".env");
  const original = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const matchingLines = lines.map((line, index) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1] === key ? index : -1).filter((index) => index >= 0);
    const nextLine = `${key}=${JSON.stringify(value)}`;
    if (matchingLines.length) {
      lines[matchingLines[0]!] = nextLine;
      for (const index of matchingLines.slice(1).reverse()) lines.splice(index, 1);
    } else {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(nextLine);
    }
  }
  const normalized = lines.join(newline).replace(new RegExp(`${newline}+$`), "") + newline;
  const temporary = `${file}.tmp`;
  await writeFile(temporary, normalized, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(temporary, file);
}

async function listJobCandidates(jobId: string): Promise<Array<Record<string, unknown>>> {
  const outputRoot = path.resolve("outputs");
  const entries = await readdir(outputRoot, { withFileTypes: true }).catch(() => []);
  const candidates: Array<{ candidate: Record<string, unknown>; generatedAt: string }> = [];
  for (const entry of entries.filter((item) => item.isDirectory() && !["uploads"].includes(item.name))) {
    const batchDirectory = path.join(outputRoot, entry.name);
    const batchReportPath = path.join(batchDirectory, "batch-parse-report.json");
    try {
      const batch = JSON.parse(await readFile(batchReportPath, "utf8")) as { items: Array<{ status: string; outputDirectory?: string; documentName?: string }> };
      for (const item of batch.items.filter((value) => value.status === "completed" && value.outputDirectory)) {
        const candidate = await readScoredCandidate(item.outputDirectory as string, jobId, item.documentName);
        if (candidate) candidates.push({ candidate, generatedAt: entry.name });
      }
    } catch {
      const candidate = await readScoredCandidate(batchDirectory, jobId);
      if (candidate) candidates.push({ candidate, generatedAt: entry.name });
    }
  }
  const stages = await readCandidateStages(jobId);
  return candidates.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt)).map(({ candidate }) => ({
    ...candidate,
    hrStage: typeof candidate.id === "string" ? stages[candidate.id] : undefined,
  }));
}

async function readScoredCandidate(directory: string, jobId: string, documentName?: string): Promise<Record<string, unknown> | null> {
  try {
    const [report, profile, score, quality, tasks, resolutions, evidence] = await Promise.all([
      readFile(path.join(directory, "parse-report.json"), "utf8").then((value) => JSON.parse(value)),
      readFile(path.join(directory, "candidate-profile.json"), "utf8").then((value) => JSON.parse(value)),
      readFile(path.join(directory, `llm-score-${jobId}.json`), "utf8").then((value) => JSON.parse(value)),
      readFile(path.join(directory, "parse-quality-report.json"), "utf8").then((value) => JSON.parse(value)),
      readFile(path.join(directory, "review-tasks.json"), "utf8").then((value) => JSON.parse(value)).catch(() => ({ tasks: [] })),
      readFile(path.join(directory, "review-resolutions.json"), "utf8").then((value) => JSON.parse(value)).catch(() => ({ resolutions: [] })),
      readFile(path.join(directory, "evidence.json"), "utf8").then((value) => JSON.parse(value)).catch(() => []),
    ]);
    const photoPath = typeof report.sourceFilePath === "string" ? await ensureResumePhoto(report.sourceFilePath, directory) : undefined;
    const candidateId = report.candidateId ?? profile.id;
    return {
      id: candidateId,
      name: profile.contactInfo?.name ?? documentName ?? report.documentName ?? "未命名候选人",
      documentName: documentName ?? report.documentName ?? path.basename(directory),
      ...(photoPath ? {
        photoPath,
        photoUrl: `/api/jobs/candidate-photo?jobId=${encodeURIComponent(jobId)}&candidateId=${encodeURIComponent(candidateId)}`,
      } : {}),
      email: profile.contactInfo?.email,
      parseStatus: quality.status ?? report.qualityStatus ?? "unknown",
      totalScore: score.finalScore,
      rawScore: score.rawScore,
      scoreMode: "llm",
      scoreReason: score.reason,
      scoreMissing: score.missing,
      scoreCaps: score.caps ?? [],
      hardGaps: score.hardGaps ?? [],
      dimensions: score.components.map((item: { name: string; score: number; maxScore: number }) => ({ name: item.name, score: item.score, weightedScore: item.maxScore })),
      requirementEvaluations: score.hardRequirementResults.map((item: { key: string; label: string; status: string; evidence: string }) => ({ id: item.key, description: item.label, status: item.status, featureKey: item.key, explanation: item.evidence, evidenceQuotes: [] })),
      reviewTasks: tasks.tasks ?? [],
      reviewResolutions: resolutions.resolutions ?? [],
      evidence: (Array.isArray(evidence) ? evidence : []).map((item: { id: string; rawText: string; source?: { pageNumber?: number; blockIndex?: number } }) => ({ id: item.id, text: item.rawText, pageNumber: item.source?.pageNumber, blockIndex: item.source?.blockIndex })),
      profile: {
        education: (profile.education ?? []).map((item: { school?: string; degree?: string; major?: string }) => [item.school, item.degree, item.major].filter(Boolean).join(" / ")),
        workExperience: (profile.workExperience ?? []).map((item: { company?: string; title?: string; dateRange?: { raw?: string } }) => [item.company, item.title, item.dateRange?.raw].filter(Boolean).join(" / ")),
        skills: (profile.skills ?? []).map((item: { name?: string }) => item.name).filter(Boolean),
        preference: [...(profile.jobPreference?.expectedTitles ?? []), ...(profile.jobPreference?.expectedLocations ?? []), profile.jobPreference?.expectedSalary].filter(Boolean),
      },
    };
  } catch {
    return null;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 100 * 1024 * 1024) throw new Error("上传内容超过 100 MB。");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function assertLocalBrowserRequest(request: IncomingMessage): void {
  const host = request.headers.host;
  if (!host) throw new Error("目录选择请求缺少本机 Host 信息。");
  const hostname = new URL(`http://${host}`).hostname;
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname)) throw new Error("仅允许本机打开目录选择器。");
  const origin = request.headers.origin;
  if (origin && new URL(origin).host !== host) throw new Error("目录选择请求来源与本机应用不一致。");
}
