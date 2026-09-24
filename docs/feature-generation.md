# FeatureSet 生成器

第一版 FeatureSet 使用规则生成，不调用 LLM。

## 原则

- 只生成 Feature，不评分。
- Feature 默认 `scorePolicy = "jd_dependent"`。
- Feature 必须绑定 `sourceFactIds` 和 `evidenceRefs`。
- 可重复、可解释、稳定输出。
- 是否参与评分由 JD / Scorecard 决定。
- Feature key 使用英文/slug，中文原文保存在 `label` 和 `displayValue`。

## 当前覆盖范围

- 技能存在：`skill.<slug>.exists`
- 技能推断熟练度：`skill.<slug>.inferred_proficiency`
- 最高学历：`education.highest_degree`
- 学校：`education.school.<slug>.exists`
- 专业：`education.major.<slug>.exists`
- 项目类型：`project.type.<type>.exists`
- 项目技术栈：`project.technology.<slug>.exists`
- 业务/研究领域：`domain.<slug>.exists`
- 语言能力：`language.<slug>.exists`、`language.<slug>.proficiency`
- 证书：`credential.certificate.<slug>.exists`
- 奖励：`achievement.award.<slug>.exists`
- 论文：`credential.publication.<slug>.exists`
- 求职偏好：`preference.title.<slug>.exists`、`preference.employment_type.<type>.exists`

## 中文标准化映射

中文词条会优先通过 `src/features/slug.ts` 中的映射表转为可读英文 slug。

当前已覆盖：

- 昆明理工大学 -> `kunming_university_of_science_and_technology`
- 齐鲁工业大学 -> `qilu_university_of_technology`
- 机械工程 -> `mechanical_engineering`
- 机械设计制造及其自动化 -> `mechanical_design_manufacturing_automation`
- 机械设计 -> `mechanical_design`
- 机器人感知与智能识别 -> `robotics_perception_intelligent_recognition`
- 串口通信 -> `serial_communication`
- 串口协议调试 -> `serial_protocol_debugging`
- 普通话二级乙等 -> `mandarin_level_2b`
- 第十三届全国大学生数学竞赛（非数学类）一等奖 -> `national_college_student_math_competition_non_math_first_prize_13th`

## 运行方式

解析简历时会自动生成：

```text
candidate-features.json
feature-report.json
```

也可以对已有输出目录单独生成：

```bash
npm run generate:features -- ./outputs/<run-id>
```

## 质量报告

`feature-report.json` 会统计：

- Feature 总数。
- 各 group 数量。
- hash slug key 数量。
- 缺少 `label` 的数量。
- 缺少 `displayValue` 的数量。
- 缺少证据或 Fact 引用的数量。

如果出现 `zh_...` key，说明该中文词条还没有标准映射。Feature 仍然可用，但建议后续补充映射表提升可读性。
