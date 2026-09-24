# 阶段 1：基础数据模型设计

本阶段目标是建立招聘简历筛选 Agent 的数据契约。后续的简历解析、JD 评分模板、规则评分和人工复核都围绕这些模型流转。

## 核心原则

- 规则优先，AI 辅助。
- AI 可以抽取和归纳信息，但不直接决定最终录用或淘汰。
- 评分只读取 `Feature` 层，不直接读取原始简历文本。
- 所有 `Fact`、`Feature` 和评分结论都应能追溯到 `Evidence`。
- 缺失、不确定或证据不足的信息应保留为未知状态，不强制推断。

## 数据流

```text
raw_resume_document
  -> extracted_text
  -> Evidence
  -> Fact
  -> CandidateProfile
  -> CandidateFeatureSet
  -> Rule Engine / Score Engine
  -> Human Review
```

## 评分字段边界

第一版评分边界定义在 `src/schemas/scoring-boundary.ts`。

### 可以参与评分

第一版不设置“天然加分项”。所有评分都必须与 JD 或评分模板中的岗位要求相关。

### 仅在 JD 或评分模板明确要求时参与

- 技能与技术栈，例如编程语言、框架、数据库、云服务、DevOps、测试、AI/ML、产品、设计和领域能力。
- 基于项目和工作经历证据推断出的技能熟练度。
- 工作经历中的职责、年限、行业经验、管理范围、业务规模、量化成果。
- 项目经历中的项目类型、业务领域、技术架构、个人贡献、项目规模、量化成果。
- 语言能力。
- 岗位相关证书。
- 奖励、竞赛、论文、专利、开源贡献。
- 学校背景。
- 公司背景。
- 学历层级。
- 专业。
- 期望岗位、期望城市、期望薪资、到岗时间和工作类型。

### 仅展示或用于运营

- 姓名。
- 邮箱。
- 手机号。
- 当前所在地。
- 简历链接或公开作品链接。

### 禁止进入评分

- 年龄。
- 性别。
- 婚育状态。
- 照片、外貌相关信息。
- 与岗位能力无关的个人身份信息。

## 模型职责

### Evidence

`Evidence` 保存原始来源，包括文档、页码、文本块、字符位置和原始文本。它回答“这个判断来自哪里”。

### Fact

`Fact` 是从简历中抽取出的客观事实，例如“候选人使用过 TypeScript”或“候选人在 2022-2025 年参与订单系统”。Fact 不直接表达好坏评价。

### CandidateProfile

`CandidateProfile` 是候选人的标准画像，包含联系方式、教育经历、工作经历、项目经历、技能、语言能力、证书、奖励、论文、专利、开源贡献、求职偏好和其他岗位相关信息。

技能熟练度不采信“精通”“熟悉”等候选人自述词作为评分依据，只记录系统基于工作和项目证据推断出的熟练度，并且必须由 JD 或评分模板启用后才可用于评分。

### CandidateFeatureSet

`CandidateFeatureSet` 是评分引擎唯一应该读取的候选人输入。它把 Profile 和 Facts 转换为稳定特征，例如 `has_typescript`、`backend_experience_years`、`highest_degree`。

### Scorecard / Requirement

`Scorecard` 是后续 JD 分析阶段的基础占位结构。它描述岗位要求、硬性条件和评分维度。

## 当前完成标准

- 已建立 TypeScript + Zod schema。
- 已定义评分字段白名单、展示字段和禁用字段。
- 已定义 `CandidateProfile`、`Evidence`、`Fact`、`Feature`。
- 已保留 `Scorecard` 和 `Requirement` 基础结构，方便进入 JD 评分模板阶段。
