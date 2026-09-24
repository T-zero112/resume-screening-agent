import { describe, expect, it } from "vitest";

import {
  CandidateFeatureSetSchema,
  CandidateProfileSchema,
  EvidenceSchema,
  FactSchema,
  JobSchema,
  ParseQualityReportSchema,
  ScorecardSchema,
  ScoreStandardSchema,
  defaultScoringBoundary,
} from "../src/schemas/index.js";

const now = "2026-09-19T12:00:00.000Z";

describe("stage 1 schemas", () => {
  it("validates a minimal candidate profile", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张三",
        email: "zhangsan@example.com",
      },
      createdAt: now,
      updatedAt: now,
    });

    expect(profile.education).toEqual([]);
    expect(profile.contactInfo.links).toEqual([]);
  });

  it("supports evidence-based skills and language abilities", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张三",
      },
      skills: [
        {
          name: "TypeScript",
          category: "programming_language",
          inferredProficiency: {
            level: "proficient",
            basis: "在多个项目中作为主要开发语言使用。",
          },
        },
      ],
      languages: [
        {
          language: "英语",
          proficiency: "professional",
          testName: "CET-6",
          score: "520",
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(profile.skills[0]?.inferredProficiency?.level).toBe("proficient");
    expect(profile.languages[0]?.language).toBe("英语");
  });

  it("supports detailed work, project, and achievement records", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张三",
      },
      workExperience: [
        {
          company: "Example Inc.",
          title: "后端工程师",
          industry: "电商",
          businessDomains: ["订单", "支付"],
          teamSize: "8人",
          quantifiedImpacts: [{ metric: "接口响应时间", value: "降低30%" }],
        },
      ],
      projectExperience: [
        {
          name: "订单系统",
          type: "company",
          businessDomain: "电商",
          architecture: "微服务",
          personalContribution: "负责订单核心链路",
          quantifiedImpacts: [{ metric: "日订单量", value: "10万+" }],
        },
      ],
      awards: [{ name: "优秀员工" }],
      publications: [{ title: "A Paper" }],
      patents: [{ title: "A Patent" }],
      openSourceContributions: [{ projectName: "oss-lib" }],
      timeline: [{ type: "work", label: "Example Inc." }],
      createdAt: now,
      updatedAt: now,
    });

    expect(profile.workExperience[0]?.quantifiedImpacts[0]?.metric).toBe("接口响应时间");
    expect(profile.projectExperience[0]?.type).toBe("company");
    expect(profile.openSourceContributions[0]?.projectName).toBe("oss-lib");
  });

  it("supports JD-dependent job preferences", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate-001",
      schemaVersion: "candidate-profile.v1",
      contactInfo: {
        name: "张三",
      },
      jobPreference: {
        expectedTitles: ["后端工程师"],
        expectedLocations: ["上海"],
        availability: "一个月内到岗",
        employmentTypes: ["full_time"],
      },
      createdAt: now,
      updatedAt: now,
    });

    expect(profile.jobPreference?.expectedTitles).toEqual(["后端工程师"]);
  });

  it("requires facts to carry evidence", () => {
    expect(() =>
      FactSchema.parse({
        id: "fact-001",
        candidateId: "candidate-001",
        kind: "skill",
        subject: "张三",
        predicate: "has_skill",
        object: "TypeScript",
        evidenceRefs: [],
        createdAt: now,
      }),
    ).toThrow();
  });

  it("validates evidence and feature sets", () => {
    const evidence = EvidenceSchema.parse({
      id: "evidence-001",
      source: {
        documentId: "doc-001",
        documentName: "resume.pdf",
        documentType: "pdf",
        pageNumber: 1,
        blockIndex: 0,
      },
      rawText: "熟悉 TypeScript 与 Node.js",
      createdAt: now,
    });

    expect(evidence.granularity).toBe("block");

    const featureSet = CandidateFeatureSetSchema.parse({
      candidateId: "candidate-001",
      schemaVersion: "candidate-features.v1",
      features: [
        {
          key: "skill.typescript.exists",
          group: "skill",
          value: true,
          valueType: "boolean",
          derivationNote: "候选人在简历文本中提到 TypeScript。",
          sourceFactIds: ["fact-001"],
          evidenceRefs: [{ evidenceId: evidence.id }],
        },
      ],
      generatedAt: now,
    });

    expect(featureSet.features[0]?.scorePolicy).toBe("jd_dependent");
  });

  it("requires score candidate features to carry fact and evidence references", () => {
    expect(() =>
      CandidateFeatureSetSchema.parse({
        candidateId: "candidate-001",
        schemaVersion: "candidate-features.v1",
        features: [
          {
            key: "skill.typescript.exists",
            group: "skill",
            value: true,
            valueType: "boolean",
            derivationNote: "候选人在简历文本中提到 TypeScript。",
          },
        ],
        generatedAt: now,
      }),
    ).toThrow();
  });

  it("validates stable dotted feature keys", () => {
    expect(() =>
      CandidateFeatureSetSchema.parse({
        candidateId: "candidate-001",
        schemaVersion: "candidate-features.v1",
        features: [
          {
            key: "has_typescript",
            group: "skill",
            value: true,
            valueType: "boolean",
            derivationNote: "候选人在简历文本中提到 TypeScript。",
            sourceFactIds: ["fact-001"],
            evidenceRefs: [{ evidenceId: "evidence-001" }],
          },
        ],
        generatedAt: now,
      }),
    ).toThrow();
  });

  it("validates parse quality reports", () => {
    const report = ParseQualityReportSchema.parse({
      schemaVersion: "parse-quality.v1",
      status: "needs_review",
      sourceFilePath: "resume.pdf",
      documentName: "resume.pdf",
      documentType: "pdf",
      metrics: {
        evidenceCount: 2,
        totalTextLength: 500,
        averageEvidenceLength: 250,
        factCount: 3,
        featureCount: 4,
        educationCount: 1,
        workExperienceCount: 0,
        projectExperienceCount: 1,
        skillCount: 2,
        unresolvedItemCount: 0,
        llmWarningCount: 1,
      },
      signals: [
        {
          id: "text.short",
          severity: "warning",
          message: "抽取到的正文偏短，建议人工确认是否遗漏了关键信息。",
        },
      ],
      generatedAt: now,
    });

    expect(report.status).toBe("needs_review");
  });

  it("supports inferred facts with explicit inference basis", () => {
    const fact = FactSchema.parse({
      id: "fact-001",
      candidateId: "candidate-001",
      kind: "domain_experience",
      derivationType: "inferred",
      subject: "candidate",
      predicate: "has_domain_experience",
      object: "order_system",
      inferenceBasis: "原文显示候选人负责订单系统核心接口设计。",
      evidenceRefs: [{ evidenceId: "evidence-001" }],
      scoreEligible: true,
      createdAt: now,
    });

    expect(fact.derivationType).toBe("inferred");
    expect(fact.scoreEligible).toBe(true);
  });

  it("requires inferred facts to explain their basis", () => {
    expect(() =>
      FactSchema.parse({
        id: "fact-001",
        candidateId: "candidate-001",
        kind: "domain_experience",
        derivationType: "inferred",
        subject: "candidate",
        predicate: "has_domain_experience",
        object: "order_system",
        evidenceRefs: [{ evidenceId: "evidence-001" }],
        createdAt: now,
      }),
    ).toThrow();
  });

  it("keeps sensitive fields out of scoring", () => {
    const restricted = defaultScoringBoundary.rules.filter((rule) => rule.policy === "restricted");

    expect(restricted.map((rule) => rule.fieldPath)).toEqual(
      expect.arrayContaining(["age", "gender", "maritalStatus", "photo"]),
    );
  });

  it("marks school, company, and job preferences as JD-dependent", () => {
    const jdDependent = defaultScoringBoundary.rules.filter((rule) => rule.policy === "jd_dependent");

    expect(jdDependent.map((rule) => rule.fieldPath)).toEqual(
      expect.arrayContaining([
        "skills",
        "skills.inferredProficiency",
        "languages",
        "education.school",
        "education.degree",
        "education.major",
        "workExperience",
        "workExperience.company",
        "projectExperience",
        "certificates",
        "awards",
        "publications",
        "patents",
        "openSourceContributions",
        "jobPreference.expectedTitles",
        "jobPreference.expectedLocations",
        "jobPreference.expectedSalary",
        "jobPreference.availability",
      ]),
    );
  });

  it("validates JD-based scorecards with weighted dimensions", () => {
    const scorecard = ScorecardSchema.parse({
      id: "scorecard-001",
      schemaVersion: "scorecard.v1",
      jobId: "job-001",
      version: 1,
      status: "draft",
      title: "后端工程师评分表",
      requirements: [
        {
          id: "req-001",
          type: "skill",
          description: "具备 TypeScript 开发经验",
          condition: {
            featureKey: "skill.typescript.exists",
            operator: "eq",
            expectedValue: true,
          },
        },
        {
          id: "req-002",
          type: "project",
          description: "具备微服务项目经验",
          condition: {
            featureKey: "project.microservice.exists",
            operator: "eq",
            expectedValue: true,
          },
        },
      ],
      dimensions: [
        {
          id: "dim-technical",
          name: "技术能力",
          weight: 0.6,
          scoringRules: [
            {
              id: "rule-001",
              requirementId: "req-001",
              description: "TypeScript 匹配度",
              maxPoints: 100,
            },
          ],
        },
        {
          id: "dim-project",
          name: "项目经验",
          weight: 0.4,
          scoringRules: [
            {
              id: "rule-002",
              requirementId: "req-002",
              description: "微服务项目匹配度",
              maxPoints: 100,
            },
          ],
        },
      ],
      reviewFlagRules: [
        {
          id: "flag-001",
          description: "关键项目证据不足时进入人工复核",
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)).toBe(1);
  });

  it("rejects scorecards whose dimension weights do not sum to 1", () => {
    expect(() =>
      ScorecardSchema.parse({
        id: "scorecard-001",
        schemaVersion: "scorecard.v1",
        jobId: "job-001",
        version: 1,
        title: "后端工程师评分表",
        requirements: [],
        dimensions: [
          {
            id: "dim-technical",
            name: "技术能力",
            weight: 0.6,
            scoringRules: [],
          },
          {
            id: "dim-project",
            name: "项目经验",
            weight: 0.3,
            scoringRules: [],
          },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("rejects scorecard rules that reference missing requirements", () => {
    expect(() =>
      ScorecardSchema.parse({
        id: "scorecard-001",
        schemaVersion: "scorecard.v1",
        jobId: "job-001",
        version: 1,
        title: "后端工程师评分表",
        requirements: [],
        dimensions: [
          {
            id: "dim-technical",
            name: "技术能力",
            weight: 1,
            scoringRules: [
              {
                id: "rule-001",
                requirementId: "req-missing",
                description: "TypeScript 匹配度",
                maxPoints: 100,
              },
            ],
          },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("validates a local job record", () => {
    const job = JobSchema.parse({
      schemaVersion: "job.v1",
      id: "job-regional-sales",
      title: "区域销售",
      jdText: "负责区域销售和客户维护。",
      createdAt: now,
      updatedAt: now,
    });

    expect(job.source).toBe("manual");
    expect(job.status).toBe("draft");
  });

  it("validates a score standard whose dimensions total 100", () => {
    const standard = ScoreStandardSchema.parse({
      schemaVersion: "score-standard.v1",
      id: "score-standard-regional-sales-v1",
      jobId: "job-regional-sales",
      version: 1,
      status: "confirmed",
      totalScore: 100,
      dimensions: [
        {
          key: "sales_development",
          name: "客户开发与销售/招商拓展",
          maxScore: 35,
          description: "直接销售、招商、BD、客户开发、客户维护。",
          highScoreGuidance: "有直接客户开发、销售或招商成果。",
          lowScoreGuidance: "缺少客户开发或商务拓展证据。",
        },
        {
          key: "transferable_business",
          name: "可迁移业务证据",
          maxScore: 25,
          description: "谈判、渠道协同、项目推进、销售支持、客户运营。",
          highScoreGuidance: "有清晰行动和可迁移成果。",
          lowScoreGuidance: "只有泛化沟通描述。",
        },
        {
          key: "results",
          name: "结果与业绩证据",
          maxScore: 15,
          description: "销售额、招商率、入驻率、续费率、转化、团队指标。",
          highScoreGuidance: "有量化结果。",
          lowScoreGuidance: "没有结果证据。",
        },
        {
          key: "practical_fit",
          name: "实际匹配条件",
          maxScore: 15,
          description: "珠海、本地资源、薪资、工作方式、学历风险。",
          highScoreGuidance: "实际条件匹配且无明显冲突。",
          lowScoreGuidance: "有明确冲突。",
        },
        {
          key: "industry_product",
          name: "行业与产品相关性",
          maxScore: 10,
          description: "环保工程、建材、工程项目、商业地产等相关性。",
          highScoreGuidance: "行业或产品高度相关。",
          lowScoreGuidance: "行业产品完全不相关。",
        },
      ],
      hardRequirements: [
        {
          key: "education",
          label: "学历",
          isHardGate: false,
          missingMeansFail: false,
          reviewOnlyWhenMissing: true,
        },
      ],
      bonusSignals: [
        {
          key: "local_resources",
          label: "本地客户资源",
          description: "珠海或广东客户资源。",
        },
      ],
      riskSignals: [
        {
          key: "salary_gap",
          label: "薪资差距",
          severity: "medium",
          affectsScore: false,
        },
      ],
      capRules: [
        {
          key: "weak_core_transfer",
          label: "核心职责迁移较弱",
          maxFinalScore: 70,
          condition: "缺少直接或相邻销售/招商/客户开发证据。",
        },
      ],
      excludedSignals: [
        {
          key: "gender",
          label: "性别",
          reason: "敏感信息，不参与评分。",
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    expect(standard.dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0)).toBe(100);
    expect(standard.status).toBe("confirmed");
  });

  it("rejects score standards whose dimensions do not total 100", () => {
    expect(() =>
      ScoreStandardSchema.parse({
        schemaVersion: "score-standard.v1",
        id: "score-standard-regional-sales-v1",
        jobId: "job-regional-sales",
        version: 1,
        totalScore: 100,
        dimensions: [
          {
            key: "sales_development",
            name: "客户开发",
            maxScore: 90,
            description: "客户开发。",
            highScoreGuidance: "强。",
            lowScoreGuidance: "弱。",
          },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });

  it("rejects duplicate score standard keys within a section", () => {
    expect(() =>
      ScoreStandardSchema.parse({
        schemaVersion: "score-standard.v1",
        id: "score-standard-regional-sales-v1",
        jobId: "job-regional-sales",
        version: 1,
        totalScore: 100,
        dimensions: [
          {
            key: "same",
            name: "A",
            maxScore: 50,
            description: "A",
            highScoreGuidance: "A",
            lowScoreGuidance: "A",
          },
          {
            key: "same",
            name: "B",
            maxScore: 50,
            description: "B",
            highScoreGuidance: "B",
            lowScoreGuidance: "B",
          },
        ],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow();
  });
});
