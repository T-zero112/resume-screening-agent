# 区域销售 Scorecard 设计说明

## 输入 JD

样本文件：`samples/jds/regional-sales.md`

岗位：区域销售。

核心职责：

- 完成销售任务。
- 负责海绵城市、雨水收集、污水系统、环保工程、园林绿化工程、玻璃钢化粪池、不锈钢水箱等业务拓展。
- 维护老客户。
- 为客户提供销售与产品知识培训。
- 完成周小结、月总结、年总结，并做销售提案。

## 评分边界

以下内容不进入自动评分：

- 性别。
- 年龄。
- 婚育等敏感个人信息。

以下内容暂不直接打分，仅作为人工复核提示：

- 自带车。
- 出差适应性。
- 性格开朗。
- 学习能力。
- 遵守制度。

原因：这些信息在简历中通常没有稳定、可验证、可结构化的证据；直接评分容易造成误判。

## 评分维度

评分表文件：`samples/scorecards/regional-sales.scorecard.json`

| 维度 | 权重 | 说明 |
| --- | ---: | --- |
| 销售与渠道能力 | 35% | 销售经验、渠道销售、客户开发和老客户维护 |
| 行业与产品匹配 | 20% | 环保、水处理、工程类产品或相近业务经验 |
| 基础任职条件 | 25% | 学历、驾照和相关专业背景 |
| 工作习惯与意向匹配 | 20% | 总结提案、办公系统、岗位意向匹配 |

## 第一版实现特点

Scorecard 已支持同一要求的多个备选条件，例如：

- 渠道销售可以匹配：
  - `skill.channel_sales.exists`
  - `skill.channel_and_distributor_management.exists`
  - `skill.channel_dealer_management.exists`
  - `skill.dealer_channel_distribution.exists`
  - `skill.offline_channel_promotion.exists`

- 相关专业可以匹配：
  - 市场营销
  - 工商管理
  - 国际贸易实务
  - 国际经济与贸易
  - 广告设计

这比单一 feature key 更适合业务类简历，因为同一能力在不同简历中表述差异较大。

## 胡丹样本试跑

样本目录：

`outputs/batch-2026-09-20T04-22-33-651Z/items/2026-09-20T04-28-53-092Z`

流程：

```bash
npm run generate:features -- "outputs\batch-2026-09-20T04-22-33-651Z\items\2026-09-20T04-28-53-092Z"
npm run score -- "outputs\batch-2026-09-20T04-22-33-651Z\items\2026-09-20T04-28-53-092Z\candidate-features.json" "samples\scorecards\regional-sales.scorecard.json" "outputs\batch-2026-09-20T04-22-33-651Z\items\2026-09-20T04-28-53-092Z\evaluation-regional-sales.json"
npm run review -- "outputs\batch-2026-09-20T04-22-33-651Z\items\2026-09-20T04-28-53-092Z\evaluation-regional-sales.json"
```

结果：

- 硬性要求：`pass`
- 总分：`29.75`

已匹配：

- 专科及以上学历：本科。
- 渠道销售或经销商管理经验：经销商与渠道协同。
- 相关专业背景：工商管理。

需要复核或未匹配：

- 驾驶证。
- 销售相关经验或技能。
- 客户开发、客户维护或业务拓展能力。
- 环保、水处理、工程类产品经验。
- 办公软件、总结汇报、方案或提案能力。
- 客户培训、产品培训或团队管理经验。
- 求职意向与销售岗位匹配。

## 当前判断

第一版 scorecard 可以跑通真实 JD 流程，但分数偏保守。

主要原因不是候选人一定不匹配，而是当前 feature 层对 JD 语义能力的聚合还不够。例如：

- “销售任务完成能力”可能藏在工作成果和业绩描述中，而不是标准 `skill.sales.exists`。
- “客户维护”可能出现在职责句中，但未形成稳定 feature。
- “总结、提案、培训”需要从工作职责中生成 JD 相关 feature。

下一步建议：

1. 增加 JD-aware feature generation，把 JD 要求转换成更贴近评分的特征。
2. 批量刷新 9 份已完成简历的 features。
3. 对 9 份简历跑区域销售评分。
4. 结合 review-resolutions 判断哪些低分是证据不足，哪些是真不匹配。
