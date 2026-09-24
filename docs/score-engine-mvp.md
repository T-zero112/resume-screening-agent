# Score Engine MVP

第一版评分引擎只做规则评分，不调用 LLM。

## 输入

- `candidate-features.json`
- `scorecard.v1`

## 输出

- `evaluation-result.v1`

## 评分规则

- 初始分为 0。
- 硬性条件先独立判断：`pass`、`fail`、`needs_review`。
- 每个评分规则满足则获得该规则全部分数，不满足则为 0。
- 每个维度分数为该维度规则得分之和，范围 0-100。
- 总分为 `Σ(维度分 × 维度权重)`。
- 风险项只输出 review flags，不自动扣分。

## 运行方式

```bash
npm run score -- ./outputs/<run-id>/candidate-features.json ./samples/scorecards/ai-agent-intern.scorecard.json
```

默认输出：

```text
outputs/<run-id>/evaluation-job-ai-agent-intern-v1.json
```
