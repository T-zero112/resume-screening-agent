import { describe, expect, it } from "vitest";

import { buildEvidenceFromDocumentText } from "../src/parsing/evidence-builder.js";
import { splitResumeTextIntoBlocks } from "../src/parsing/resume-blocks.js";

describe("resume parsing helpers", () => {
  it("builds block-level evidence from extracted document text", () => {
    const evidence = buildEvidenceFromDocumentText(
      {
        documentName: "resume.txt",
        documentType: "txt",
        blocks: [
          {
            text: "熟悉 TypeScript 与 Node.js",
            blockIndex: 0,
          },
        ],
      },
      "resume.txt",
      "2026-09-20T00:00:00.000Z",
    );

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.granularity).toBe("block");
    expect(evidence[0]?.source.documentType).toBe("txt");
    expect(evidence[0]?.rawText).toContain("TypeScript");
  });

  it("splits resume text into semantic blocks", () => {
    const blocks = splitResumeTextIntoBlocks(
      [
        "张迅",
        "求职意向：Agent开发实习生",
        "教育背景",
        "昆明理工大学 - 机械工程 - 硕士 2024.09 - 2027.06",
        "项目经验",
        "基于 LeRobot 与 SO-100 的机械臂数据采集与抓取系统 2026.07 - 至今",
        "技术栈： Python · PyTorch · LeRobot",
        "BossHunter Improved 智能求职 Agent 2026.09 - 至今",
        "技术栈：Python · FastAPI · React · TypeScript",
        "专业技能",
        "- 编程与开发:Python、TypeScript、Git",
        "- 人工智能/深度学习:CNN、PyTorch",
        "18eb8c4f022edd141HNy2t-5FFpQxYi8V_KbWOKmlv_YNhNi3w~~",
        "-- 1 of 1 --",
      ].join("\n"),
      1,
    );

    expect(blocks.map((block) => block.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("教育背景"),
        expect.stringContaining("编程与开发"),
        expect.stringContaining("人工智能/深度学习"),
      ]),
    );
    expect(
      blocks.some((block) => block.text.includes("基于 LeRobot") && block.text.includes("技术栈： Python")),
    ).toBe(true);
    expect(
      blocks.some((block) => block.text.includes("BossHunter") && block.text.includes("技术栈：Python · FastAPI")),
    ).toBe(true);
    expect(blocks.some((block) => block.text.includes("-- 1 of 1 --"))).toBe(false);
    expect(blocks.some((block) => block.text.includes("18eb8c4f022edd141"))).toBe(false);
  });
});
