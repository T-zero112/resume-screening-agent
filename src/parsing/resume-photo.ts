import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const minimumDimension = 96;
const maximumDimension = 1600;
const maximumImageBytes = 3 * 1024 * 1024;
const inFlight = new Map<string, Promise<string | undefined>>();

type ImageCandidate = { data: Buffer; width: number; height: number; extension: "png" | "jpg" };

export async function ensureResumePhoto(filePath: string, outputDirectory: string): Promise<string | undefined> {
  const metadataPath = path.join(outputDirectory, "candidate-photo.json");
  const existing = await readFile(metadataPath, "utf8").then((value) => JSON.parse(value) as { fileName?: string }).catch(() => undefined);
  if (existing) {
    if (!existing.fileName) return undefined;
    const storedPath = path.join(outputDirectory, existing.fileName);
    return await access(storedPath).then(() => storedPath).catch(() => undefined);
  }

  const pending = inFlight.get(metadataPath);
  if (pending) return pending;

  const extraction = extractAndStorePhoto(filePath, outputDirectory, metadataPath);
  inFlight.set(metadataPath, extraction);
  try {
    return await extraction;
  } catch (error) {
    console.warn("Resume photo could not be stored:", error instanceof Error ? error.message : error);
    return undefined;
  } finally {
    inFlight.delete(metadataPath);
  }
}

async function extractAndStorePhoto(filePath: string, outputDirectory: string, metadataPath: string): Promise<string | undefined> {
  let candidate: ImageCandidate | undefined;
  try {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".pdf") candidate = await extractPdfPhoto(filePath);
    if (extension === ".docx") candidate = await extractDocxPhoto(filePath);
  } catch (error) {
    console.warn("Resume photo extraction failed:", error instanceof Error ? error.message : error);
  }

  if (!candidate) {
    await writeMetadata(metadataPath, { status: "not_found" });
    return undefined;
  }

  const fileName = `candidate-photo.${candidate.extension}`;
  const storedPath = path.join(outputDirectory, fileName);
  await writeFile(storedPath, candidate.data);
  await writeMetadata(metadataPath, { status: "found", fileName });
  return storedPath;
}

async function extractPdfPhoto(filePath: string): Promise<ImageCandidate | undefined> {
  const parser = new PDFParse({ data: await readFile(filePath) });
  try {
    const result = await parser.getImage({ partial: [1], imageThreshold: minimumDimension, imageBuffer: true, imageDataUrl: false });
    const candidates = result.pages.flatMap((page) => page.images.map((image) => ({
      data: Buffer.from(image.data),
      width: image.width,
      height: image.height,
      extension: "png" as const,
    })));
    return choosePortraitCandidate(candidates);
  } finally {
    await parser.destroy();
  }
}

async function extractDocxPhoto(filePath: string): Promise<ImageCandidate | undefined> {
  const candidates: ImageCandidate[] = [];
  await mammoth.convertToHtml({ path: filePath }, {
    convertImage: mammoth.images.imgElement(async (image) => {
      const data = await image.read();
      const dimensions = readImageDimensions(data);
      const extension = image.contentType === "image/png" ? "png" : image.contentType === "image/jpeg" ? "jpg" : undefined;
      if (dimensions && extension) candidates.push({ data, ...dimensions, extension });
      return { src: "" };
    }),
  });
  return choosePortraitCandidate(candidates);
}

function choosePortraitCandidate(images: ImageCandidate[]): ImageCandidate | undefined {
  return images
    .filter(({ data, width, height }) => {
      const aspectRatio = width / height;
      return data.length <= maximumImageBytes
        && width >= minimumDimension
        && height >= minimumDimension
        && width <= maximumDimension
        && height <= maximumDimension
        && aspectRatio >= 0.5
        && aspectRatio <= 1.25;
    })
    .sort((left, right) => Math.abs(left.width / left.height - 0.78) - Math.abs(right.width / right.height - 0.78))[0];
}

function readImageDimensions(data: Buffer): { width: number; height: number } | undefined {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1]!;
    const segmentLength = data.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    if (segmentLength < 2) return undefined;
    offset += 2 + segmentLength;
  }
  return undefined;
}

async function writeMetadata(filePath: string, value: { status: "found" | "not_found"; fileName?: string }): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}
