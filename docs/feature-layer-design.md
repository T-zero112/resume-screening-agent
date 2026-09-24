# Feature 层设计说明

Feature 层是评分引擎读取候选人信息的唯一入口。评分引擎不应直接读取 `CandidateProfile` 或原始简历文本。

## 设计目标

Feature 只表达可计算事实，不表达主观评价。

可以表达：

```text
skill.typescript.exists = true
experience.backend.years = 3
domain.ecommerce.exists = true
language.english.cet6_score = 520
preference.availability = "one_month"
```

不应表达：

```text
candidate_is_excellent = true
backend_ability_is_strong = true
```

## 数据流

```text
Evidence
  -> Fact
  -> CandidateProfile
  -> CandidateFeatureSet
  -> JD / Scorecard
  -> Score Engine
```

## Feature 默认策略

所有 Feature 默认使用：

```text
scorePolicy = "jd_dependent"
```

这表示 Feature 只是评分候选输入，最终是否参与评分必须由 JD 或评分模板决定。

当前第一版不设置天然 `scorable` Feature。

## 可追溯要求

当 Feature 的 `scorePolicy` 是 `jd_dependent` 或 `scorable` 时，必须包含：

- `sourceFactIds`
- `evidenceRefs`
- `derivationNote`

这样后续每个评分项都能追溯到事实和原文证据。

## Feature Key 命名

Feature key 使用稳定层级命名：

```text
<group>.<subject>.<property>
```

示例：

```text
skill.typescript.exists
skill.spring_boot.exists
skill.typescript.inferred_proficiency
experience.backend.years
experience.management.team_size
domain.ecommerce.exists
project.microservice.exists
education.highest_degree
language.english.cet6_score
preference.availability
achievement.performance_optimization.exists
```

命名原则：

- 使用小写英文。
- 使用点号表达层级。
- 使用下划线表达词组。
- 不在 key 中放候选人姓名、公司名等不稳定文本。
- 同义词在生成 Feature 前应尽量归一，例如 JS 和 JavaScript 归一为 `javascript`。
- 中文原文不直接放进 key；key 使用英文/slug，中文保存在 `label` 和 `displayValue`。

## Feature 分组

| 分组 | 用途 |
| --- | --- |
| `skill` | 技能、技术栈、工具。 |
| `experience` | 工作年限、岗位职责、管理范围、业务规模。 |
| `project` | 项目类型、架构、贡献、复杂度。 |
| `education` | 学历、专业、学校相关条件。 |
| `language` | 语言能力、考试、分数。 |
| `preference` | 期望岗位、城市、薪资、到岗时间、工作类型。 |
| `achievement` | 量化成果、奖项成果。 |
| `credential` | 证书、专利、论文、开源贡献。 |
| `domain` | 行业、业务领域经验。 |
| `timeline` | 时间线、空窗期等预留特征。 |
| `other` | 其他岗位相关特征。 |

## 与 JD / Scorecard 的关系

Feature 可以保存 `jdRequirementRefs`，表示该特征已经被某个 JD 要求或评分维度引用。

但需要注意：

- 有 `jdRequirementRefs` 不等于已经得分。
- 最终分数由 Score Engine 根据 Scorecard 计算。
- Feature 层只提供事实输入。

## 示例

### 技能存在

```json
{
  "key": "skill.typescript.exists",
  "group": "skill",
  "value": true,
  "valueType": "boolean",
  "scorePolicy": "jd_dependent",
  "derivationType": "direct",
  "derivationNote": "候选人在项目经历中明确提到使用 TypeScript。",
  "sourceFactIds": ["fact-001"],
  "evidenceRefs": [{ "evidenceId": "evidence-001" }],
  "confidence": 0.9
}
```

### 推断熟练度

```json
{
  "key": "skill.typescript.inferred_proficiency",
  "group": "skill",
  "value": "proficient",
  "valueType": "string",
  "scorePolicy": "jd_dependent",
  "derivationType": "inferred",
  "derivationNote": "候选人在多个项目中使用 TypeScript 承担核心开发职责。",
  "sourceFactIds": ["fact-001", "fact-002"],
  "evidenceRefs": [{ "evidenceId": "evidence-001" }],
  "confidence": 0.75
}
```

### JD 未引用时

如果 JD 没有要求 TypeScript，`skill.typescript.exists` 可以存在于 FeatureSet 中，但不会参与评分。

如果 JD 明确要求 TypeScript，Scorecard 可以引用该 key 并决定其权重。
