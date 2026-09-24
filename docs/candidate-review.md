# Candidate Review

`candidate-review.json` 是面向人工复核的展示数据。

第一版不输出推荐状态，只展示：

- 总分。
- 硬性条件状态。
- 维度得分。
- 已匹配项。
- 未匹配项。
- 需要复核项。
- review flags。
- 原文证据 quote。

## 运行方式

```bash
npm run review -- ./outputs/<run-id>/evaluation-job-ai-agent-intern-v1.json
```

默认输出：

```text
outputs/<run-id>/candidate-review.json
```
