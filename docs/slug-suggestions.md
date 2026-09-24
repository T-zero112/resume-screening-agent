# LLM 辅助 Slug 建议

中文标准化映射使用本地词库：

```text
data/slug-mappings/zh-CN.json
```

当 Feature key 中出现 `zh_...`，说明该中文词条还没有标准映射。系统可以调用 LLM 生成建议 slug，但第一版只写入建议文件，不自动修改正式词库。

## 运行方式

```bash
npm run suggest:slugs -- ./outputs/<run-id>/candidate-features.json
```

默认输出：

```text
outputs/<run-id>/slug-suggestions.json
```

## 工作流

```text
未知中文词
  -> hash slug
  -> feature-report 标记
  -> LLM 生成 suggestedSlug
  -> 人工确认
  -> 写入 data/slug-mappings/zh-CN.json
```

## 安全边界

- LLM 不直接修改正式映射表。
- suggestedSlug 必须符合 `^[a-z][a-z0-9_]*$`。
- 正式映射仍由人工确认后写入。
