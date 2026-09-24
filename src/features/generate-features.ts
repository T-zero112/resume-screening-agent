import {
  CandidateFeatureSetSchema,
  type CandidateFeatureSet,
  type CandidateProfile,
  type EvidenceRef,
  type Fact,
  type Feature,
  type FeatureGroup,
  type FeatureValue,
} from "../schemas/index.js";
import { toFeatureSlug } from "./slug.js";

type AddFeatureInput = {
  key: string;
  group: FeatureGroup;
  label?: string;
  displayValue?: string;
  value: FeatureValue;
  valueType: Feature["valueType"];
  derivationType?: Feature["derivationType"];
  derivationNote: string;
  evidenceRefs: EvidenceRef[];
  sourceFactIds?: string[];
  confidence?: number;
};

export function generateCandidateFeatures(
  profile: CandidateProfile,
  facts: Fact[],
  generatedAt = new Date().toISOString(),
): CandidateFeatureSet {
  const features = new Map<string, Feature>();

  const addFeature = (input: AddFeatureInput) => {
    if (input.evidenceRefs.length === 0) {
      return;
    }

    const parsed = CandidateFeatureSetSchema.shape.features.element.parse({
      key: input.key,
      group: input.group,
      label: input.label,
      displayValue: input.displayValue,
      value: input.value,
      valueType: input.valueType,
      scorePolicy: "jd_dependent",
      derivationType: input.derivationType ?? "direct",
      derivationNote: input.derivationNote,
      sourceFactIds: input.sourceFactIds ?? findFactIdsForFeature(input.key, facts),
      evidenceRefs: input.evidenceRefs,
      confidence: input.confidence ?? 0.7,
    });

    if (parsed.sourceFactIds.length > 0) {
      features.set(parsed.key, parsed);
    }
  };

  for (const skill of profile.skills) {
    const slug = toFeatureSlug(skill.normalizedName ?? skill.name);
    addFeature({
      key: `skill.${slug}.exists`,
      group: "skill",
      label: `技能：${skill.name}`,
      displayValue: skill.name,
      value: true,
      valueType: "boolean",
      derivationNote: `候选人画像中记录了技能：${skill.name}。`,
      evidenceRefs: skill.evidenceRefs,
      confidence: skill.confidence,
    });

    if (skill.inferredProficiency) {
      addFeature({
        key: `skill.${slug}.inferred_proficiency`,
        group: "skill",
        label: `技能熟练度：${skill.name}`,
        displayValue: `${skill.name}：${skill.inferredProficiency.level}`,
        value: skill.inferredProficiency.level,
        valueType: "string",
        derivationType: "inferred",
        derivationNote: skill.inferredProficiency.basis ?? `基于项目或经历证据推断 ${skill.name} 熟练度。`,
        evidenceRefs: skill.inferredProficiency.evidenceRefs.length > 0 ? skill.inferredProficiency.evidenceRefs : skill.evidenceRefs,
        confidence: skill.inferredProficiency.confidence,
      });
    }
  }

  const highestEducation = getHighestEducation(profile);
  if (highestEducation?.degree) {
    addFeature({
      key: "education.highest_degree",
      group: "education",
      label: "最高学历",
      displayValue: highestEducation.degree,
      value: highestEducation.degree,
      valueType: "string",
      derivationNote: `候选人最高学历识别为：${highestEducation.degree}。`,
      evidenceRefs: highestEducation.evidenceRefs,
      confidence: highestEducation.confidence,
    });
  }

  for (const education of profile.education) {
    if (education.school) {
      addFeature({
        key: `education.school.${toFeatureSlug(education.school)}.exists`,
        group: "education",
        label: `学校：${education.school}`,
        displayValue: education.school,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人教育经历包含学校：${education.school}。`,
        evidenceRefs: education.evidenceRefs,
        confidence: education.confidence,
      });
    }

    if (education.major) {
      addFeature({
        key: `education.major.${toFeatureSlug(education.major)}.exists`,
        group: "education",
        label: `专业：${education.major}`,
        displayValue: education.major,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人教育经历包含专业：${education.major}。`,
        evidenceRefs: education.evidenceRefs,
        confidence: education.confidence,
      });
    }
  }

  for (const project of profile.projectExperience) {
    if (project.type) {
      addFeature({
        key: `project.type.${project.type}.exists`,
        group: "project",
        label: `项目类型：${project.type}`,
        displayValue: project.type,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人项目经历包含 ${project.type} 类型项目。`,
        evidenceRefs: project.evidenceRefs,
        confidence: project.confidence,
      });
    }

    if (project.businessDomain) {
      addFeature({
        key: `domain.${toFeatureSlug(project.businessDomain)}.exists`,
        group: "domain",
        label: `领域：${project.businessDomain}`,
        displayValue: project.businessDomain,
        value: true,
        valueType: "boolean",
        derivationType: "inferred",
        derivationNote: `候选人项目经历体现了业务/研究领域：${project.businessDomain}。`,
        evidenceRefs: project.evidenceRefs,
        confidence: project.confidence,
      });
    }

    for (const technology of project.technologies) {
      addFeature({
        key: `project.technology.${toFeatureSlug(technology)}.exists`,
        group: "project",
        label: `项目技术：${technology}`,
        displayValue: technology,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人项目经历使用技术：${technology}。`,
        evidenceRefs: project.evidenceRefs,
        confidence: project.confidence,
      });
    }
  }

  for (const language of profile.languages) {
    const slug = toFeatureSlug(language.language);
    addFeature({
      key: `language.${slug}.exists`,
      group: "language",
      label: `语言：${language.language}`,
      displayValue: language.language,
      value: true,
      valueType: "boolean",
      derivationNote: `候选人语言能力包含：${language.language}。`,
      evidenceRefs: language.evidenceRefs,
      confidence: language.confidence,
    });

    addFeature({
      key: `language.${slug}.proficiency`,
      group: "language",
      label: `语言熟练度：${language.language}`,
      displayValue: `${language.language}：${language.proficiency}`,
      value: language.proficiency,
      valueType: "string",
      derivationNote: `候选人语言 ${language.language} 熟练度记录为：${language.proficiency}。`,
      evidenceRefs: language.evidenceRefs,
      confidence: language.confidence,
    });
  }

  for (const certificate of profile.certificates) {
    addFeature({
      key: `credential.certificate.${toFeatureSlug(certificate.name)}.exists`,
      group: "credential",
      label: `证书：${certificate.name}`,
      displayValue: certificate.name,
      value: true,
      valueType: "boolean",
      derivationNote: `候选人证书包含：${certificate.name}。`,
      evidenceRefs: certificate.evidenceRefs,
      confidence: certificate.confidence,
    });
  }

  for (const award of profile.awards) {
    addFeature({
      key: `achievement.award.${toFeatureSlug(award.name)}.exists`,
      group: "achievement",
      label: `奖励：${award.name}`,
      displayValue: award.name,
      value: true,
      valueType: "boolean",
      derivationNote: `候选人奖励/荣誉包含：${award.name}。`,
      evidenceRefs: award.evidenceRefs,
      confidence: award.confidence,
    });
  }

  for (const publication of profile.publications) {
    addFeature({
      key: `credential.publication.${toFeatureSlug(publication.title)}.exists`,
      group: "credential",
      label: `论文：${publication.title}`,
      displayValue: publication.title,
      value: true,
      valueType: "boolean",
      derivationNote: `候选人论文成果包含：${publication.title}。`,
      evidenceRefs: publication.evidenceRefs,
      confidence: publication.confidence,
    });
  }

  if (profile.jobPreference) {
    for (const title of profile.jobPreference.expectedTitles) {
      addFeature({
        key: `preference.title.${toFeatureSlug(title)}.exists`,
        group: "preference",
        label: `期望岗位：${title}`,
        displayValue: title,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人期望岗位包含：${title}。`,
        evidenceRefs: profile.jobPreference.evidenceRefs,
        confidence: profile.jobPreference.confidence,
      });
    }

    for (const employmentType of profile.jobPreference.employmentTypes) {
      addFeature({
        key: `preference.employment_type.${employmentType}.exists`,
        group: "preference",
        label: `期望工作类型：${employmentType}`,
        displayValue: employmentType,
        value: true,
        valueType: "boolean",
        derivationNote: `候选人期望工作类型包含：${employmentType}。`,
        evidenceRefs: profile.jobPreference.evidenceRefs,
        confidence: profile.jobPreference.confidence,
      });
    }
  }

  return CandidateFeatureSetSchema.parse({
    candidateId: profile.id,
    schemaVersion: "candidate-features.v1",
    features: [...features.values()].sort((left, right) => left.key.localeCompare(right.key)),
    generatedAt,
    generatorVersion: "rule-based-feature-generator.v1",
  });
}

function getHighestEducation(profile: CandidateProfile): CandidateProfile["education"][number] | undefined {
  const rank: Record<string, number> = {
    博士: 4,
    doctor: 4,
    phd: 4,
    硕士: 3,
    master: 3,
    本科: 2,
    bachelor: 2,
    专科: 1,
    associate: 1,
  };

  return [...profile.education].sort((left, right) => {
    const leftRank = left.degree ? rank[left.degree.toLowerCase()] ?? rank[left.degree] ?? 0 : 0;
    const rightRank = right.degree ? rank[right.degree.toLowerCase()] ?? rank[right.degree] ?? 0 : 0;
    return rightRank - leftRank;
  })[0];
}

function findFactIdsForFeature(key: string, facts: Fact[]): string[] {
  const keyParts = new Set(key.split(".").filter((part) => part.length > 2));
  const matches = facts.filter((fact) => {
    const factText = [fact.kind, fact.subject, fact.predicate, fact.object, JSON.stringify(fact.attributes)]
      .join(" ")
      .toLowerCase();

    return [...keyParts].some((part) => factText.includes(part));
  });

  if (matches.length > 0) {
    return matches.map((fact) => fact.id);
  }

  return facts.slice(0, 1).map((fact) => fact.id);
}
