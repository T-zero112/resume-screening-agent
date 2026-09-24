# Evidence 与 Fact 设计说明

本文档说明简历解析阶段的中间层设计。系统不应直接从原始简历文本跳到 `CandidateProfile`，而应先建立可追溯的 `Evidence` 和客观 `Fact`。

## 数据流

```text
raw_resume_document
  -> extracted_text_blocks
  -> Evidence
  -> Fact
  -> CandidateProfile
  -> CandidateFeatureSet
  -> Score Engine
```

## Evidence 设计

`Evidence` 表示可追溯的原文证据。第一版使用文本块或段落级证据。

### 粒度

默认粒度为 `block`。可选值：

| 值 | 含义 |
| --- | --- |
| `document` | 整份文档 |
| `page` | 单页 |
| `block` | 文本块 |
| `paragraph` | 段落 |
| `sentence` | 句子 |
| `field` | 字段级片段 |

第一版优先使用 `block` 或 `paragraph`，原因是简历 PDF 和 DOCX 的文本抽取不一定能稳定切分成句子或字段。

### 必须保留原文

`Evidence.rawText` 必须保留原始文本片段。它用于：

- 人工复核。
- 评分理由解释。
- 解析错误排查。
- 后续高亮定位。

`normalizedText` 可保存清洗后的文本，但不能替代 `rawText`。

### 来源信息

`Evidence.source` 记录：

- 文档 ID。
- 文档名称。
- 文档类型。
- 页码。
- 章节名称。
- 文本块 ID。
- 文本块序号。
- 字符起止位置。

对于 PDF 或复杂文档，可使用 `boundingBox` 预留页面坐标，后续支持原文高亮。

## Fact 设计

`Fact` 表示从证据中得到的客观事实。Fact 不直接表达好坏评价，也不直接产生分数。

### Fact 必须绑定 Evidence

每个 Fact 必须至少绑定一个 `evidenceRef`。没有证据的 Fact 不能进入 `CandidateProfile` 或评分链路。

### Fact 类型

当前支持：

- `education`
- `employment`
- `project`
- `skill`
- `certificate`
- `achievement`
- `domain_experience`
- `language`
- `job_preference`
- `award`
- `publication`
- `patent`
- `open_source`
- `timeline`
- `other`

### 直接事实与推断事实

`derivationType` 分为：

| 类型 | 含义 |
| --- | --- |
| `direct` | 原文直接表达的事实。 |
| `inferred` | 基于原文证据推断出的事实。 |

例如原文：

```text
2022-2025 使用 Spring Boot 开发订单系统
```

可生成直接事实：

- 使用 Spring Boot。
- 参与订单系统。
- 时间为 2022-2025。

也可生成推断事实：

- 具备后端开发经验。
- 具备微服务相关经验。

推断事实必须填写：

- `derivationType = "inferred"`
- `inferenceBasis`
- `confidence`
- `evidenceRefs`

## 评分可用性

`Fact.scoreEligible` 表示该 Fact 是否可进入后续候选特征生成和评分候选池。

注意：

- `scoreEligible = true` 不代表一定评分。
- 最终是否评分仍必须由 JD 或评分模板决定。
- 默认值为 `false`，避免无关事实进入评分。

## Fact 到 CandidateProfile 的映射

`Fact` 是原子事实，`CandidateProfile` 是候选人画像。两者关系如下：

| Fact 类型 | 可映射到 CandidateProfile |
| --- | --- |
| `education` | `education` |
| `employment` | `workExperience` |
| `project` | `projectExperience` |
| `skill` | `skills` |
| `certificate` | `certificates` |
| `achievement` | `workExperience.achievements`、`projectExperience.achievements`、`quantifiedImpacts` |
| `domain_experience` | `workExperience.businessDomains`、`projectExperience.businessDomain` |
| `language` | `languages` |
| `job_preference` | `jobPreference` |
| `award` | `awards` |
| `publication` | `publications` |
| `patent` | `patents` |
| `open_source` | `openSourceContributions` |
| `timeline` | `timeline` |

## 示例

### 技能事实

原文：

```text
熟悉 TypeScript，使用 NestJS 开发后台管理系统。
```

直接事实：

```json
{
  "kind": "skill",
  "derivationType": "direct",
  "subject": "candidate",
  "predicate": "has_skill",
  "object": "TypeScript",
  "scoreEligible": true
}
```

注意：“熟悉”这个自述词不直接作为熟练度评分依据。后续熟练度应结合项目、工作职责和成果证据推断。

### 推断事实

原文：

```text
负责订单系统核心接口设计，日订单量 10 万+。
```

推断事实：

```json
{
  "kind": "domain_experience",
  "derivationType": "inferred",
  "subject": "candidate",
  "predicate": "has_domain_experience",
  "object": "order_system",
  "inferenceBasis": "原文显示候选人负责订单系统核心接口设计，并提供日订单量规模。",
  "scoreEligible": true
}
```

该事实是否最终进入评分，仍取决于 JD 是否要求订单、交易、电商或类似业务经验。
