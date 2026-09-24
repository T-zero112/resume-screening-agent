import "dotenv/config";

import { parseResumeBatch } from "../pipeline/parse-resume-batch.js";

const inputDirectory = process.argv[2];

if (!inputDirectory) {
  console.error("Usage: npm run parse:batch -- <resume-directory>");
  process.exit(1);
}

try {
  const itemTimeoutMs = Number(process.env.BATCH_PARSE_ITEM_TIMEOUT_MS ?? 300_000);
  const outputDirectory = await parseResumeBatch({
    inputDirectory,
    itemTimeoutMs,
    onProgress: (message) => console.log(message),
  });
  console.log(`Batch parse completed: ${outputDirectory}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
