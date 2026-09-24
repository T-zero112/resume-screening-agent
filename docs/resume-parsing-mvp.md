# 阶段 2：简历解析 MVP

阶段 2 的目标是跑通第一条真实简历解析链路：

```text
PDF / DOCX / TXT
  -> 文本提取
  -> Evidence
  -> LLM 抽取
  -> Fact
  -> CandidateProfile
  -> JSON 输出
```

## 运行方式

第一版使用 CLI：

```bash
npm run parse -- ./path/to/resume.pdf
```

需要设置：

```env
LLM_API_KEY=...
LLM_MODEL=...
```

推荐在项目根目录创建 `.env`，可以从 `.env.example` 复制：

```powershell
Copy-Item .env.example .env
```

OpenAI 示例：

```env
LLM_PROVIDER=openai
LLM_API_KEY=...
LLM_MODEL=gpt-6-astra
```

DeepSeek 示例：

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
```

也兼容旧的 provider-specific 环境变量：

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-6-astra

DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

其他可选设置：

```env
MAX_LLM_INPUT_CHARS=60000
```

## 支持范围

当前支持：

- 普通 PDF。
- DOCX。
- TXT。

暂不支持：

- 扫描 PDF。
- 图片简历。
- OCR。
- 复杂排版高精度坐标还原。

## 输出结构

每次运行会生成：

```text
outputs/<run-id>/
  evidence.json
  facts.json
  candidate-profile.json
  candidate-features.json
  feature-report.json
  parse-report.json
```

## LLM 抽取原则

- 只从 Evidence 文本块中抽取信息。
- 不编造信息。
- Fact 必须引用 Evidence。
- 推断 Fact 必须写明 `inferenceBasis`。
- 不确定信息进入 `unresolvedItems` 或 `warnings`。
- 敏感信息不进入 CandidateProfile 或 Facts。

## 校验

LLM 输出必须通过 Zod schema 校验：

- `CandidateProfileSchema`
- `FactSchema`
- `EvidenceSchema`

校验失败时，本次解析不会写入伪成功结果。
