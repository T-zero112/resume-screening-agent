# CandidateProfile 与评分边界说明

本文档说明 `CandidateProfile` 中各类信息的用途，以及这些信息能否进入评分。核心原则是：系统可以完整结构化简历信息，但评分必须由 JD 或评分模板授权。

## 总体原则

- 不设置天然加分项。
- 所有评分都必须与 JD 或评分模板中的岗位要求相关。
- AI 可用于抽取、归纳和辅助推断，但不直接决定最终评分。
- 评分引擎只读取 `CandidateFeatureSet`，不直接读取原始简历文本。
- 学校背景、公司背景、语言能力、证书奖项、求职偏好等信息都不能默认加分。
- 候选人自述的“精通”“熟悉”“了解”等词不直接作为技能熟练度评分依据。
- 技能熟练度只记录系统基于工作经历、项目经历和成果证据推断出的结果。
- 所有可用于评分或复核的信息都应尽量绑定 `Evidence`。

## 字段策略

字段评分策略分为四类：

| 策略 | 含义 |
| --- | --- |
| `scorable` | 可直接参与评分。当前第一版不设置天然 `scorable` 字段。 |
| `jd_dependent` | 只有 JD 或评分模板明确启用时，才可参与硬筛或评分。 |
| `display_only` | 只用于展示、联系、去重、人工复核，不进入评分。 |
| `restricted` | 禁止进入评分上下文。 |

## CandidateProfile 字段说明

### 基础信息

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `contactInfo.name` | 姓名 | `display_only` | 仅用于识别候选人。 |
| `contactInfo.email` | 邮箱 | `display_only` | 用于联系和去重。 |
| `contactInfo.phone` | 手机号 | `display_only` | 用于联系和去重。 |
| `contactInfo.location` | 当前所在地 | `display_only` | 用于展示和人工复核，不默认参与评分。 |
| `contactInfo.links` | 公开链接 | `display_only` | 如 GitHub、作品集、LinkedIn、个人网站等。 |

### 教育经历

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `education.school` | 学校 | `jd_dependent` | 仅在 JD 或评分模板明确要求时参与评分。 |
| `education.degree` | 学历层级 | `jd_dependent` | 可用于岗位明确学历门槛或评分细则。 |
| `education.major` | 专业 | `jd_dependent` | 仅在岗位要求专业背景时参与评分。 |
| `education.dateRange` | 教育时间 | `display_only` | 当前主要用于展示和时间线。 |

### 工作经历

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `workExperience.company` | 公司 | `jd_dependent` | 公司背景不默认加分，仅在 JD 明确要求时参与。 |
| `workExperience.title` | 职位 | `jd_dependent` | 与目标岗位职责相关时可参与评分。 |
| `workExperience.industry` | 行业 | `jd_dependent` | 岗位要求行业经验时可参与。 |
| `workExperience.businessDomains` | 业务领域 | `jd_dependent` | 如订单、支付、风控、推荐等。 |
| `workExperience.teamSize` | 团队规模 | `jd_dependent` | 管理或协作能力相关岗位可使用。 |
| `workExperience.managementScope` | 管理范围 | `jd_dependent` | 管理岗或负责人岗位可使用。 |
| `workExperience.businessScale` | 业务规模 | `jd_dependent` | 如用户量、订单量、营收规模等。 |
| `workExperience.responsibilities` | 职责 | `jd_dependent` | 与 JD 职责匹配时参与评分。 |
| `workExperience.achievements` | 成果 | `jd_dependent` | 与岗位要求相关时参与评分。 |
| `workExperience.quantifiedImpacts` | 量化成果 | `jd_dependent` | 需要证据支撑。 |
| `workExperience.technologies` | 技术栈 | `jd_dependent` | 与 JD 技术要求匹配时参与评分。 |

### 项目经历

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `projectExperience.type` | 项目类型 | `jd_dependent` | 公司项目、个人项目、开源项目、学术项目等。 |
| `projectExperience.role` | 项目角色 | `jd_dependent` | 与 JD 职责相关时参与。 |
| `projectExperience.businessDomain` | 业务领域 | `jd_dependent` | 与岗位业务方向匹配时参与。 |
| `projectExperience.architecture` | 技术架构 | `jd_dependent` | 技术岗评分时可使用。 |
| `projectExperience.projectScale` | 项目规模 | `jd_dependent` | 与岗位复杂度要求相关时参与。 |
| `projectExperience.personalContribution` | 个人贡献 | `jd_dependent` | 用于区分参与和主导。 |
| `projectExperience.quantifiedImpacts` | 量化成果 | `jd_dependent` | 如性能提升、成本降低、用户增长等。 |
| `projectExperience.technologies` | 技术栈 | `jd_dependent` | 与 JD 技术要求匹配时参与评分。 |

### 技能

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `skills.name` | 技能名称 | `jd_dependent` | 仅在与 JD 技能要求匹配时参与评分。 |
| `skills.category` | 技能类别 | `jd_dependent` | 如编程语言、框架、数据库、云服务、DevOps、测试、AI/ML、产品、设计、领域能力等。 |
| `skills.normalizedName` | 标准化名称 | `jd_dependent` | 用于同义词归一，例如 JS 与 JavaScript。 |
| `skills.inferredProficiency` | 推断熟练度 | `jd_dependent` | 只基于工作、项目、成果证据推断，不采信候选人自述词。 |

### 语言能力

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `languages.language` | 语言名称 | `jd_dependent` | JD 要求对应语言时才参与评分。 |
| `languages.proficiency` | 语言熟练度 | `jd_dependent` | 需要结合证书、考试或经历证据。 |
| `languages.testName` | 考试名称 | `jd_dependent` | 如 CET-6、IELTS、TOEFL、JLPT。 |
| `languages.score` | 分数 | `jd_dependent` | 岗位要求明确语言门槛时可使用。 |

### 证书、奖励和成果

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `certificates` | 证书 | `jd_dependent` | 岗位相关证书才参与评分。 |
| `awards` | 奖励、竞赛、荣誉 | `jd_dependent` | 校招、科研、算法等岗位可能相关。 |
| `publications` | 论文 | `jd_dependent` | 主要用于科研、算法、学术相关岗位。 |
| `patents` | 专利 | `jd_dependent` | 仅在岗位相关时参与。 |
| `openSourceContributions` | 开源贡献 | `jd_dependent` | 技术岗位或开源相关岗位可使用。 |

### 求职偏好

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `jobPreference.expectedTitles` | 期望岗位 | `jd_dependent` | 与 JD 做匹配时使用。 |
| `jobPreference.expectedLocations` | 期望城市 | `jd_dependent` | 岗位地点匹配时使用。 |
| `jobPreference.expectedSalary` | 期望薪资 | `jd_dependent` | 与岗位预算匹配时使用。 |
| `jobPreference.availability` | 到岗时间 | `jd_dependent` | 岗位有到岗要求时使用。 |
| `jobPreference.employmentTypes` | 工作类型 | `jd_dependent` | 全职、兼职、实习、合同、远程等。 |

### 时间线

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `timeline` | 经历时间线 | `display_only` | 当前仅预留，用于展示、复核和后续空窗期分析。 |

### 其他信息

| 字段 | 含义 | 策略 | 说明 |
| --- | --- | --- | --- |
| `summary` | 简历摘要 | `display_only` | 用于展示，不直接评分。 |
| `otherJobRelatedInfo` | 其他岗位相关信息 | `jd_dependent` | 必须由 JD 或评分模板明确关联后才能使用。 |
| `unresolvedItems` | 未能确定的信息 | `display_only` | 用于人工复核。 |

## Restricted 字段

以下字段暂时禁止进入评分上下文：

- `age`
- `gender`
- `maritalStatus`
- `photo`

如果简历中出现这些信息，解析阶段可以选择不抽取，或隔离保存到非评分区域。当前第一版不扩展更多敏感字段。

## 示例

### JD 要求 TypeScript

候选人简历中出现 TypeScript，并且项目或工作经历中有相关证据时：

- `skills.name = "TypeScript"` 可与 JD 技能要求匹配。
- `skills.inferredProficiency` 可基于项目数量、职责深度、成果证据推断。
- 该技能可进入评分。

### JD 未要求英语

候选人有 CET-6 或 IELTS 成绩：

- `languages` 可结构化保存。
- 前端可展示。
- 不参与评分。

### JD 未要求名校或特定公司背景

候选人毕业于名校或曾任职知名公司：

- `education.school` 和 `workExperience.company` 可结构化保存。
- 不默认加分。
- 只有评分模板显式启用时才可参与。

### JD 要求一周内到岗

候选人的 `jobPreference.availability` 可用于硬性条件判断或人工复核。

如果 JD 没有到岗时间要求，该字段只展示，不参与评分。
