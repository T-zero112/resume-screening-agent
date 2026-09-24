import "dotenv/config";

import { parseResume } from "../pipeline/parse-resume.js";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npm run parse -- <resume.pdf|resume.docx|resume.txt>");
  process.exit(1);
}

try {
  const outputDirectory = await parseResume({ filePath });
  console.log(`Parse completed: ${outputDirectory}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
