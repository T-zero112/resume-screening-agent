# 简历筛选 Agent

面向单机 HR 工作流的本地简历筛选工具。它将岗位要求整理为可由 HR 审核、修改和确认的评分标准，再对简历进行解析与评分，并提供候选人流程管理、面试邮件草稿和邮件收件能力。

## 功能

- 创建岗位、录入 JD，并生成可编辑的评分标准；HR 确认后才用于评分。
- 支持 PDF、DOCX、TXT 简历解析、批量上传、质量提示和失败重试。
- 按已确认的岗位评分标准生成候选人分数、优势、风险和原文证据。
- 管理候选人状态，批量处理面试、待定和淘汰；为面试候选人编辑独立邮件草稿。
- 可选连接 QQ 邮箱预设或其他支持标准 IMAP/SMTP 登录的邮箱，通过 IMAP 接收简历附件并按邮件主题匹配岗位；疑似云附件邮件会标为待下载并展示链接，不会自动登录或下载第三方云盘内容。
- 可选 LangSmith 追踪 LLM 调用元数据；默认关闭。
- 提供 Windows 桌面安装包，数据保存在当前 Windows 用户本机，不在 HR 用户之间同步。

## 技术栈

- TypeScript、React、Vite
- Electron
- Node.js 本地 API
- Zod 数据模型校验
- OpenAI-compatible LLM API（例如 DeepSeek）
- LangSmith（可选追踪）
- Vitest

## 开发环境

- Windows、macOS 或 Linux
- Node.js 及 npm（建议使用当前维护中的 LTS 版本）
- 兼容 OpenAI Chat Completions 接口的模型服务及其 API Key

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell 可用以下命令复制配置模板：

```powershell
Copy-Item .env.example .env
```

在 `.env` 中配置模型提供方、模型名称及 API Key。`.env` 已被 Git 忽略，切勿提交真实密钥。

## Windows 桌面版

```bash
npm run desktop:dev
npm run desktop:dist
```

安装程序生成在 `release/`。桌面应用使用 Electron `safeStorage` 在当前 Windows 用户上下文中保护 API Key。每位 HR 需要自行配置模型 API Key；本应用不提供跨用户同步或集中式服务器。

覆盖安装新版通常不会删除应用数据，但卸载选项、系统账户迁移和手动清理可能影响数据。正式更新前应备份应用数据目录和单独设置的简历归档目录。API Key 受 Windows 用户保护，迁移到另一台电脑或账户时应重新配置。

## CLI

```bash
npm run typecheck
npm test
npm run parse -- ./path/to/resume.pdf
npm run score:llm -- ./outputs/<parse-run-directory> <job-id>
npm run generate:features -- ./outputs/<run-id>
npm run score -- ./outputs/<run-id>/candidate-features.json ./samples/scorecards/ai-agent-intern.scorecard.json
npm run review -- ./outputs/<run-id>/evaluation-job-ai-agent-intern-v1.json
npm run suggest:slugs -- ./outputs/<run-id>/candidate-features.json
```

`score:llm` 只读取已确认的评分标准；草稿标准不会用于评分。`outputs/` 为本地生成目录，不应提交。

## 配置

模型 API：

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

可选 LangSmith 追踪：

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your-langsmith-api-key
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=resume-screening
```

邮箱可在桌面版设置中配置 QQ 预设或自定义 IMAP/SMTP 服务器及客户端授权码。仅支持邮件服务商允许使用 IMAP/SMTP 凭据登录的账户；OAuth-only 账户暂不支持。旧版 `QQ_MAIL_*` 环境变量仍兼容。

## 数据与隐私

- 简历、岗位、评分、邮件收件记录和草稿默认保存在本机，不应上传到 GitHub 或其他未经授权的服务。
- 使用 LLM 解析或评分时，完成任务所需的 JD 与简历内容会发送给所配置的模型服务商；请先核对该服务商的数据处理和保留政策。
- 开启 LangSmith 后仅用于记录经项目配置筛选的追踪信息；仍应在启用前审查追踪范围和组织保留策略。
- Git 忽略规则排除了本机 `data/`（仅保留应用内置 slug 映射）、运行输出、真实候选人展示数据、密钥文件和安装包。提交前仍应检查 `git status` 与暂存区内容。
- 评分用于辅助初筛，HR 应依据简历原文和岗位要求复核，不应仅凭模型分数作出招聘决定。

## 项目结构

```text
electron/       Windows 桌面主进程与 preload
src/viewer/     React 前端
src/server.ts   本地 API
src/schemas/    TypeScript + Zod 数据模型
src/parsing/    文档提取、证据构建、质量检查和 PDF 视觉 OCR
src/extraction/ LLM 简历结构化
src/features/   候选人特征生成
src/scoring/    评分标准生成与评分引擎
src/jobs/       岗位、评分进程及候选人流程
src/mail/       邮箱收件与简历归档
src/observability/用量统计与 LangSmith 追踪
samples/        脱敏 JD 与评分标准示例
docs/           设计说明
tests/          自动化测试
```

## 状态

项目仍在积极迭代，尚未声明稳定版本。邮箱云附件、跨设备迁移、自动更新、备份恢复和实际 HR 工作流等仍需按部署环境验证。当前桌面端安装包通过重新构建并手动分发更新。

## License

当前仓库尚未指定开源许可证。公开仓库前应由项目维护者决定是否开源及采用何种许可证；没有许可证时，默认版权规则仍然适用。
