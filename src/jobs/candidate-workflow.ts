import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type CandidateStage = "interview" | "pending" | "rejected";
type CandidateStageStore = Record<string, { stage: CandidateStage; updatedAt: string }>;
const writes = new Map<string, Promise<void>>();

export async function readCandidateStages(jobId: string): Promise<Record<string, CandidateStage>> {
  const store = await readStore(jobId);
  return Object.fromEntries(Object.entries(store).map(([candidateId, value]) => [candidateId, value.stage]));
}

export async function updateCandidateStage(jobId: string, candidateId: string, stage: CandidateStage | null): Promise<void> {
  assertSafeJobId(jobId);
  if (!candidateId.trim() || candidateId.length > 200) throw new Error("候选人编号无效。");
  const file = storePath(jobId);
  const previous = writes.get(jobId) ?? Promise.resolve();
  let resolveWrite!: () => void;
  const current = new Promise<void>((resolve) => { resolveWrite = resolve; });
  writes.set(jobId, current);
  await previous.catch(() => undefined);
  try {
    const store = await readStore(jobId);
    if (stage === null) delete store[candidateId];
    else store[candidateId] = { stage, updatedAt: new Date().toISOString() };
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await rename(temporary, file);
  } finally {
    resolveWrite();
    if (writes.get(jobId) === current) writes.delete(jobId);
  }
}

async function readStore(jobId: string): Promise<CandidateStageStore> {
  assertSafeJobId(jobId);
  return readFile(storePath(jobId), "utf8").then((text) => JSON.parse(text) as CandidateStageStore).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
}

function storePath(jobId: string): string {
  return path.join(path.resolve("data/jobs"), jobId, "candidate-workflow.json");
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(jobId)) throw new Error("岗位编号无效。");
}
