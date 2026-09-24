import { z } from "zod";

export const ScoringFieldPolicySchema = z.enum(["scorable", "jd_dependent", "display_only", "restricted"]);
export type ScoringFieldPolicy = z.infer<typeof ScoringFieldPolicySchema>;

export const ScoringFieldRuleSchema = z.object({
  fieldPath: z.string().min(1),
  policy: ScoringFieldPolicySchema,
  reason: z.string().min(1),
});
export type ScoringFieldRule = z.infer<typeof ScoringFieldRuleSchema>;

export const ScoringBoundarySchema = z.object({
  schemaVersion: z.literal("scoring-boundary.v1"),
  rules: z.array(ScoringFieldRuleSchema),
});
export type ScoringBoundary = z.infer<typeof ScoringBoundarySchema>;

export const defaultScoringBoundary: ScoringBoundary = {
  schemaVersion: "scoring-boundary.v1",
  rules: [
    {
      fieldPath: "skills",
      policy: "jd_dependent",
      reason: "技能仅在与JD要求或评分模板维度匹配时参与评分。",
    },
    {
      fieldPath: "skills.inferredProficiency",
      policy: "jd_dependent",
      reason: "技能熟练度只采用基于项目和工作证据推断的结果，并且仅在JD相关评分细则启用时参与评分。",
    },
    {
      fieldPath: "languages",
      policy: "jd_dependent",
      reason: "语言能力仅在JD或评分模板明确要求时参与评分，不作为天然加分项。",
    },
    {
      fieldPath: "education.school",
      policy: "jd_dependent",
      reason: "学校背景仅在JD或评分模板明确要求时参与评分，不作为默认加分项。",
    },
    {
      fieldPath: "education.degree",
      policy: "jd_dependent",
      reason: "学历层级仅在JD或评分模板明确要求时用于硬筛或评分。",
    },
    {
      fieldPath: "education.major",
      policy: "jd_dependent",
      reason: "专业仅在JD或评分模板明确要求时参与评分。",
    },
    {
      fieldPath: "workExperience",
      policy: "jd_dependent",
      reason: "工作年限、岗位职责、行业经验和技术栈仅在与JD相关时参与评分。",
    },
    {
      fieldPath: "workExperience.company",
      policy: "jd_dependent",
      reason: "公司背景仅在JD或评分模板明确要求时参与评分，不作为默认加分项。",
    },
    {
      fieldPath: "projectExperience",
      policy: "jd_dependent",
      reason: "项目职责、技术、贡献和成果仅在与JD相关时参与评分。",
    },
    {
      fieldPath: "certificates",
      policy: "jd_dependent",
      reason: "证书仅在与JD或评分模板要求相关时参与评分。",
    },
    {
      fieldPath: "awards",
      policy: "jd_dependent",
      reason: "奖励荣誉仅在与JD或评分模板要求相关时参与评分。",
    },
    {
      fieldPath: "publications",
      policy: "jd_dependent",
      reason: "论文仅在科研、算法等JD相关场景中参与评分。",
    },
    {
      fieldPath: "patents",
      policy: "jd_dependent",
      reason: "专利仅在与JD或评分模板要求相关时参与评分。",
    },
    {
      fieldPath: "openSourceContributions",
      policy: "jd_dependent",
      reason: "开源贡献仅在与JD或评分模板要求相关时参与评分。",
    },
    {
      fieldPath: "timeline",
      policy: "display_only",
      reason: "时间线当前仅用于展示和后续分析预留，不直接参与评分。",
    },
    {
      fieldPath: "contactInfo.name",
      policy: "display_only",
      reason: "姓名仅用于识别候选人，不参与评分。",
    },
    {
      fieldPath: "contactInfo.email",
      policy: "display_only",
      reason: "邮箱仅用于联系和去重，不参与评分。",
    },
    {
      fieldPath: "contactInfo.phone",
      policy: "display_only",
      reason: "手机号仅用于联系和去重，不参与评分。",
    },
    {
      fieldPath: "contactInfo.location",
      policy: "display_only",
      reason: "当前所在地仅用于展示、联系和人工复核，不默认参与评分。",
    },
    {
      fieldPath: "contactInfo.links",
      policy: "display_only",
      reason: "公开链接用于人工查看作品或履历来源，不直接参与评分。",
    },
    {
      fieldPath: "jobPreference.expectedTitles",
      policy: "jd_dependent",
      reason: "期望岗位用于与JD做匹配，仅在评分模板启用时参与筛选。",
    },
    {
      fieldPath: "jobPreference.expectedLocations",
      policy: "jd_dependent",
      reason: "期望城市用于与JD做匹配，仅在评分模板启用时参与筛选。",
    },
    {
      fieldPath: "jobPreference.expectedSalary",
      policy: "jd_dependent",
      reason: "期望薪资用于与岗位预算做匹配，仅在评分模板启用时参与筛选。",
    },
    {
      fieldPath: "jobPreference.availability",
      policy: "jd_dependent",
      reason: "到岗时间用于与岗位需求做匹配，仅在评分模板启用时参与筛选。",
    },
    {
      fieldPath: "jobPreference.employmentTypes",
      policy: "jd_dependent",
      reason: "工作类型用于与岗位需求做匹配，仅在评分模板启用时参与筛选。",
    },
    {
      fieldPath: "age",
      policy: "restricted",
      reason: "年龄属于敏感或高风险字段，默认禁止进入评分。",
    },
    {
      fieldPath: "gender",
      policy: "restricted",
      reason: "性别禁止进入评分。",
    },
    {
      fieldPath: "maritalStatus",
      policy: "restricted",
      reason: "婚育状态禁止进入评分。",
    },
    {
      fieldPath: "photo",
      policy: "restricted",
      reason: "照片或外貌信息禁止进入评分。",
    },
  ],
};
