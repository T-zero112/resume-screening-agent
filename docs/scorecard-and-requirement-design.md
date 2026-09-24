# Scorecard 与 Requirement 设计说明

本文档说明 JD 如何转为可执行评分模板。第一版只设计评分模板结构，不实现评分计算。

## 核心原则

- 候选人初始分为 0。
- 不设置独立加分项。
- 所有得分都来自与 JD 的匹配度。
- 硬性条件先独立判断：`pass`、`fail`、`needs_review`。
- 评分维度各自为 0-100 分。
- 总分为 0-100。
- 总分由维度分按权重汇总。
- 评分维度权重总和必须等于 1。
- 风险项不自动扣分，只生成 `reviewFlag` 供人工复核。
- Scorecard 修改时生成新版本，不覆盖旧版本。

## 数据流

```text
JD
  -> Requirement
  -> Scorecard
  -> CandidateFeatureSet
  -> Score Engine
  -> Human Review
```

Scorecard 只能引用 Feature key，不能直接引用 `CandidateProfile` 或原始简历文本。

## Requirement

`Requirement` 表示 JD 中的一条岗位要求。

字段说明：

| 字段 | 含义 |
| --- | --- |
| `id` | 要求 ID。 |
| `type` | 要求类型，如技能、经验、项目、教育、语言、偏好等。 |
| `description` | 人类可读的要求描述。 |
| `condition.featureKey` | 绑定的 Feature key。 |
| `condition.operator` | 判断操作符。 |
| `condition.expectedValue` | 期望值。 |
| `isHardRequirement` | 是否硬性条件。 |
| `evidenceRequired` | 是否必须有证据。 |
| `allowHumanReview` | 不确定时是否允许进入人工复核。 |

示例：

```json
{
  "id": "req-001",
  "type": "skill",
  "description": "具备 TypeScript 开发经验",
  "condition": {
    "featureKey": "skill.typescript.exists",
    "operator": "eq",
    "expectedValue": true
  },
  "isHardRequirement": false,
  "evidenceRequired": true,
  "allowHumanReview": true
}
```

## 硬性条件

硬性条件不参与加权分计算，先独立判断。

示例：

- 必须具备某项技能。
- 至少 N 年相关经验。
- 必须满足学历门槛。
- 必须能在指定时间内到岗。
- 必须接受某工作地点或工作类型。

结果可以是：

```text
pass
fail
needs_review
```

如果证据缺失或信息不确定，优先进入 `needs_review`，不强制判断。

## 评分维度

`ScoreDimension` 表示一个评分维度，例如：

- 技术能力
- 项目经验
- 业务匹配
- 求职匹配
- 语言能力

每个维度：

- 分数范围为 0-100。
- 包含若干条 `scoringRules`。
- `scoringRules.maxPoints` 之和必须为 100。
- 每条评分规则引用一个 Requirement。

示例：

```json
{
  "id": "dim-technical",
  "name": "技术能力",
  "weight": 0.4,
  "maxScore": 100,
  "scoringRules": [
    {
      "id": "rule-001",
      "requirementId": "req-001",
      "description": "TypeScript 匹配度",
      "maxPoints": 40
    },
    {
      "id": "rule-002",
      "requirementId": "req-002",
      "description": "Node.js 匹配度",
      "maxPoints": 60
    }
  ]
}
```

## 总分计算

每个候选人的总分：

```text
totalScore = Σ(dimensionScore × dimensionWeight)
```

示例：

```text
技术能力：80 × 0.4 = 32
项目经验：70 × 0.3 = 21
业务匹配：60 × 0.2 = 12
求职匹配：100 × 0.1 = 10
总分：75
```

## 风险项

风险项不自动扣分，只生成 `reviewFlag`。

常见风险项：

- 关键经历证据不足。
- 简历时间线不清晰。
- 硬性条件信息缺失。
- JD 关键要求未找到明确证据。

人工复核可以基于风险项进行确认。

## 版本管理

Scorecard 包含：

- `id`
- `jobId`
- `version`
- `status`
- `createdBy`
- `createdAt`
- `updatedAt`

当 HR 修改已经用于筛选的 Scorecard 时，应生成新版本，而不是覆盖旧版本。

这样可以保证同一批候选人的评分标准可追溯。
