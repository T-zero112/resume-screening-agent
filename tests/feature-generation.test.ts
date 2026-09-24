import { describe, expect, it } from "vitest";

import { buildFeatureReport } from "../src/features/feature-report.js";
import { generateCandidateFeatures } from "../src/features/generate-features.js";
import { CandidateProfileSchema, FactSchema } from "../src/schemas/index.js";

const now = "2026-09-20T00:00:00.000Z";
const evidenceRefs = [{ evidenceId: "evidence-001" }];

describe("feature generation", () => {
  it("generates rule-based features from profile and facts", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张迅",
      },
      education: [
        {
          school: "昆明理工大学",
          degree: "硕士",
          major: "机械工程",
          evidenceRefs,
        },
      ],
      skills: [
        {
          name: "TypeScript",
          category: "programming_language",
          inferredProficiency: {
            level: "working",
            basis: "项目中使用 TypeScript。",
            evidenceRefs,
          },
          evidenceRefs,
        },
      ],
      projectExperience: [
        {
          name: "Agent 项目",
          type: "personal",
          businessDomain: "机器人感知与智能识别",
          technologies: ["TypeScript"],
          evidenceRefs,
        },
      ],
      languages: [
        {
          language: "英语",
          proficiency: "working",
          evidenceRefs,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    const facts = [
      FactSchema.parse({
        id: "fact-001",
        candidateId: "candidate-001",
        kind: "skill",
        subject: "candidate",
        predicate: "has_skill",
        object: "TypeScript",
        evidenceRefs,
        scoreEligible: true,
        createdAt: now,
      }),
    ];

    const featureSet = generateCandidateFeatures(profile, facts, now);
    const keys = featureSet.features.map((feature) => feature.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        "skill.typescript.exists",
        "skill.typescript.inferred_proficiency",
        "education.highest_degree",
        "education.major.mechanical_engineering.exists",
        "project.technology.typescript.exists",
        "domain.robotics_perception_intelligent_recognition.exists",
        "language.english.exists",
      ]),
    );
    expect(featureSet.features.every((feature) => feature.sourceFactIds.length > 0)).toBe(true);
    expect(featureSet.features.every((feature) => feature.evidenceRefs.length > 0)).toBe(true);
    expect(featureSet.features.find((feature) => feature.key === "education.highest_degree")?.displayValue).toBe("硕士");
  });

  it("reports hash slug and display metadata quality", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张迅",
      },
      awards: [
        {
          name: "未映射中文奖项",
          evidenceRefs,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    const facts = [
      FactSchema.parse({
        id: "fact-001",
        candidateId: "candidate-001",
        kind: "award",
        subject: "candidate",
        predicate: "has_award",
        object: "未映射中文奖项",
        evidenceRefs,
        scoreEligible: true,
        createdAt: now,
      }),
    ];

    const featureSet = generateCandidateFeatures(profile, facts, now);
    const report = buildFeatureReport(featureSet, now);

    expect(report.hashSlugCount).toBeGreaterThan(0);
    expect(report.missingLabelCount).toBe(0);
    expect(report.missingDisplayValueCount).toBe(0);
  });

  it("uses readable slugs for known Chinese terms", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张迅",
      },
      education: [
        {
          school: "昆明理工大学",
          major: "机械工程",
          evidenceRefs,
        },
      ],
      skills: [
        {
          name: "串口协议调试",
          category: "domain",
          evidenceRefs,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    const facts = [
      FactSchema.parse({
        id: "fact-001",
        candidateId: "candidate-001",
        kind: "skill",
        subject: "candidate",
        predicate: "has_skill",
        object: "串口协议调试",
        evidenceRefs,
        scoreEligible: true,
        createdAt: now,
      }),
    ];

    const featureSet = generateCandidateFeatures(profile, facts, now);
    const keys = featureSet.features.map((feature) => feature.key);

    expect(keys).toEqual(
      expect.arrayContaining([
        "education.school.kunming_university_of_science_and_technology.exists",
        "education.major.mechanical_engineering.exists",
        "skill.serial_protocol_debugging.exists",
      ]),
    );
  });
});
