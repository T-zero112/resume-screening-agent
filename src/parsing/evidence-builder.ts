import { createHash, randomUUID } from "node:crypto";

import { EvidenceSchema, type Evidence } from "../schemas/index.js";
import type { ExtractedDocumentText } from "./document-text.js";

export function buildEvidenceFromDocumentText(
  documentText: ExtractedDocumentText,
  sourceFilePath: string,
  createdAt: string,
): Evidence[] {
  const documentId = createHash("sha256").update(sourceFilePath).digest("hex").slice(0, 16);

  return documentText.blocks.map((block) =>
    EvidenceSchema.parse({
      id: `evidence-${randomUUID()}`,
      source: {
        documentId,
        documentName: documentText.documentName,
        documentType: documentText.documentType,
        pageNumber: block.pageNumber,
        blockId: `block-${block.blockIndex}`,
        blockIndex: block.blockIndex,
      },
      granularity: "block",
      rawText: block.text,
      normalizedText: block.text.replace(/\s+/g, " ").trim(),
      extractionMethod: block.extractionMethod ?? "parser",
      confidence: 1,
      createdAt,
    }),
  );
}
