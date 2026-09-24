import type { ExtractedTextBlock } from "./document-text.js";

const SECTION_HEADINGS = new Set([
  "教育背景",
  "项目经验",
  "工作经历",
  "实习经历",
  "学术成果",
  "专业技能",
  "技能证书",
  "证书",
  "语言能力",
  "个人信息",
  "求职意向",
]);

const SKILL_PREFIX_PATTERN = /^[-•]?\s*([^:：\n]{2,24})[:：]/;
const PROJECT_DATE_PATTERN = /\d{4}[./-]\d{1,2}\s*[-–—]\s*(?:至今|\d{4}[./-]\d{1,2})/;
const PAGE_FOOTER_PATTERN = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const NOISE_LINE_PATTERN = /^[a-f0-9]{12,}[A-Za-z0-9_~.-]{12,}$/i;

export function splitResumeTextIntoBlocks(text: string, pageNumber?: number): ExtractedTextBlock[] {
  const lines = normalizeLines(text);
  const blocks: string[] = [];
  let currentHeading = "基础信息";
  let currentLines: string[] = [];

  const flush = () => {
    const block = currentLines.join("\n").trim();
    if (block) {
      blocks.push(block);
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (SECTION_HEADINGS.has(line)) {
      flush();
      currentHeading = line;
      currentLines.push(line);
      continue;
    }

    if (shouldStartNewBlock(currentHeading, line, currentLines)) {
      flush();
    }

    currentLines.push(line);
  }

  flush();

  return stitchProjectBlocks(blocks).map((block, index) => ({
    text: block,
    pageNumber,
    blockIndex: index,
  }));
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !PAGE_FOOTER_PATTERN.test(line))
    .filter((line) => !isNoiseLine(line));
}

function isNoiseLine(line: string): boolean {
  if (NOISE_LINE_PATTERN.test(line)) {
    return true;
  }

  return /[A-Za-z0-9_-]{20,}~~$/.test(line) && !/[\u4e00-\u9fa5]/.test(line);
}

function shouldStartNewBlock(currentHeading: string, line: string, currentLines: string[]): boolean {
  if (currentLines.length === 0) {
    return false;
  }

  if (currentHeading === "项目经验" && PROJECT_DATE_PATTERN.test(line)) {
    return true;
  }

  if (currentHeading === "项目经验" && /^技术栈[:：]/.test(line) && currentLines.length > 1) {
    return true;
  }

  if (PROJECT_DATE_PATTERN.test(line) && !isEducationLine(line)) {
    return true;
  }

  if (currentHeading === "专业技能" && SKILL_PREFIX_PATTERN.test(line)) {
    return true;
  }

  if (currentHeading === "学术成果" && /^以.+作者身份/.test(line)) {
    return true;
  }

  return false;
}

function isEducationLine(line: string): boolean {
  return /大学|学院|本科|硕士|博士|专科/.test(line);
}

function stitchProjectBlocks(blocks: string[]): string[] {
  const projectSectionIndex = blocks.findIndex((block) => block.startsWith("项目经验"));
  if (projectSectionIndex === -1) {
    return blocks;
  }

  const projectTitleIndices = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block, index }) => index < projectSectionIndex && PROJECT_DATE_PATTERN.test(block) && !isEducationLine(block))
    .map(({ index }) => index);

  if (projectTitleIndices.length === 0) {
    return blocks;
  }

  const projectDetailIndices: number[] = [];
  for (let index = projectSectionIndex; index < blocks.length; index += 1) {
    const block = blocks[index] ?? "";
    if (index !== projectSectionIndex && SECTION_HEADINGS.has(block.split("\n")[0] ?? "")) {
      break;
    }

    if (index === projectSectionIndex || block.startsWith("技术栈")) {
      projectDetailIndices.push(index);
    }
  }

  const stitchedProjects = projectTitleIndices.map((titleIndex, index) => {
    const title = blocks[titleIndex] ?? "";
    const detailIndex = projectDetailIndices[index];
    const detail = detailIndex === undefined ? "" : (blocks[detailIndex] ?? "").replace(/^项目经验\n?/, "").trim();

    return [title, detail].filter(Boolean).join("\n");
  });
  const skipped = new Set([...projectTitleIndices, ...projectDetailIndices]);
  const stitched: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    if (projectTitleIndices.includes(index)) {
      continue;
    }

    if (index === projectSectionIndex) {
      stitched.push(...stitchedProjects);
      continue;
    }

    if (skipped.has(index)) {
      continue;
    }

    stitched.push(blocks[index] ?? "");
  }

  return stitched;
}
