import { readFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import { transcribePdfPageWithVision } from "./pdf-vision-ocr.js";
import { splitResumeTextIntoBlocks } from "./resume-blocks.js";

export type ExtractedTextBlock = {
  text: string;
  pageNumber?: number;
  blockIndex: number;
  extractionMethod?: "parser" | "ocr" | "vision";
};

export type PdfPageTriage = {
  pageNumber: number;
  route: "text" | "scanned";
  charCount: number;
  needsVision: boolean;
  reason: string;
};

export type ExtractedDocumentText = {
  documentName: string;
  documentType: "pdf" | "docx" | "txt" | "unknown";
  blocks: ExtractedTextBlock[];
  pdfTriage?: PdfPageTriage[];
  warnings?: string[];
};

export async function extractDocumentText(filePath: string): Promise<ExtractedDocumentText> {
  const extension = path.extname(filePath).toLowerCase();
  const documentName = path.basename(filePath);

  if (extension === ".pdf") {
    return extractPdfText(filePath, documentName);
  }

  if (extension === ".docx") {
    return extractDocxText(filePath, documentName);
  }

  if (extension === ".txt") {
    const text = await readFile(filePath, "utf8");
    return {
      documentName,
      documentType: "txt",
      blocks: splitResumeTextIntoBlocks(text),
    };
  }

  throw new Error(`Unsupported resume file type: ${extension || "unknown"}. Supported: .pdf, .docx, .txt`);
}

async function extractPdfText(filePath: string, documentName: string): Promise<ExtractedDocumentText> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const minTextChars = Number.parseInt(process.env.PDF_TEXT_PAGE_MIN_CHARS ?? "40", 10);
  const enableVisionOcr = process.env.ENABLE_PDF_VISION_OCR !== "false";
  const warnings: string[] = [];

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const pageCount = info.total || 1;
    const pageTexts: string[] = [];
    const triage: PdfPageTriage[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const result = await parser.getText({ partial: [pageNumber] });
      const text = result.text.trim();
      const needsVision = text.replace(/\s+/g, "").length < minTextChars;
      let resolvedText = text;
      let route: PdfPageTriage["route"] = needsVision ? "scanned" : "text";
      let reason = needsVision
        ? `text layer has fewer than ${minTextChars} non-space characters`
        : "text layer is usable";

      if (needsVision && enableVisionOcr) {
        try {
          const screenshot = await parser.getScreenshot({ partial: [pageNumber], scale: 2 });
          const page = screenshot.pages[0];
          const imageDataUrl =
            page?.dataUrl ??
            (page?.data ? `data:image/png;base64,${Buffer.from(page.data).toString("base64")}` : undefined);

          if (!imageDataUrl) {
            throw new Error("PDF screenshot did not include image data.");
          }

          const ocr = await transcribePdfPageWithVision({ imageDataUrl, pageNumber, documentName });
          if (ocr.text) {
            resolvedText = ocr.text;
            reason = `text layer was weak; transcribed with ${ocr.provider}/${ocr.model}`;
          } else {
            reason = "text layer was weak; vision OCR returned no readable text";
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Page ${pageNumber} vision OCR failed: ${message}`);
          reason = `text layer was weak; vision OCR failed: ${message}`;
        }
      }

      pageTexts.push(resolvedText);
      triage.push({
        pageNumber,
        route,
        charCount: resolvedText.length,
        needsVision,
        reason,
      });
    }

    return {
      documentName,
      documentType: "pdf",
      blocks: pageTexts.flatMap((pageText, pageIndex) =>
        splitResumeTextIntoBlocks(pageText, pageIndex + 1).map((block) => ({
          ...block,
          pageNumber: pageIndex + 1,
          extractionMethod: triage[pageIndex]?.needsVision ? "vision" : "parser",
        })),
      ),
      pdfTriage: triage,
      warnings,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(filePath: string, documentName: string): Promise<ExtractedDocumentText> {
  const result = await mammoth.extractRawText({ path: filePath });

  return {
    documentName,
    documentType: "docx",
    blocks: splitResumeTextIntoBlocks(result.value),
  };
}
