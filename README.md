# AI GitHub 日报 Worker

一个基于 Cloudflare Workers 的 AI / GitHub 热门项目邮件系统。

目标是地输出一封**适合每天阅读的短期热门 AI 项目与行业动态邮件**。

## 项目特点

- 以 GitHub Trending 日榜作为主候选源
- 以 Trendshift 作为辅助候选源，补充上升中的仓库
- 抓取橘鸦（Juya）AI 日报的 RSS 内容，整合最新 AI 行业新闻
- 抓取 OpenAI、GitHub、Cloudflare 等官方动态 RSS
- 优先关注短期星标爆发，而不是长期累计 stars
- 自动做候选合并、去重、家族聚合和风险过滤
- 使用兼容 OpenAI Chat Completions 协议的 LLM 生成中文邮件摘要
- 通过 Cloudflare Queues 执行长任务，避免 HTTP 请求超时导致的失败
- 通过 Cloudflare Email Routing 直接发送邮件

## 适用场景


- 每天定时接收 AI / Agent / 编程工具领域的新热点
- 希望把 GitHub 热门项目、行业新闻和简短中文摘要整合在一起
- 希望整个系统部署在 Cloudflare 上，无需本地常驻运行


## 工作流程

每次执行时，系统会按顺序完成：

1. 抓取 GitHub Trending 日榜
2. 抓取 Trendshift 热门仓库
3. 合并两个网页源并做仓库级去重
4. 补充 GitHub 仓库元数据
5. 结合短期热度、项目类型、重复抑制和风险信号做筛选
6. 抓取橘鸦（Juya）AI 日报 RSS 和官方动态 RSS（OpenAI、GitHub、Cloudflare 等）
7. 调用兼容 OpenAI Chat Completions 协议的 LLM 生成中文邮件标题、总览、项目说明和新闻摘要
8. 通过 Cloudflare Email Routing 发信

## 技术栈

- Cloudflare Workers
- Cloudflare Queues
- Cloudflare KV
- Cloudflare Email Routing / `send_email`
- GitHub Trending 网页
- Trendshift 网页
- 橘鸦（Juya）AI 日报 RSS
- OpenAI、GitHub、Cloudflare 等官方动态 RSS
- GitHub REST API
- 任意兼容 OpenAI Chat Completions 协议的 LLM 提供方

## 目录说明

- `index.js`：Worker 主逻辑
- `wrangler.toml`：Cloudflare 部署配置模板
- `docs/ARCHITECTURE.md`：架构说明
- `docs/OPERATIONS.md`：运行与维护说明

## 部署需求

需要先准备：

- 一个 Cloudflare 账号
- 一个可发信的域名，并已接入 Cloudflare
- Cloudflare Email Routing
- 一个 KV Namespace
- 一个 Queue
- 一个兼容 OpenAI Chat Completions 协议的 LLM API Key
- 可选的 GitHub Token

## 配置说明

### 环境变量

- `EMAIL_FROM`：发件地址，例如 `digest@example.com`
- `EMAIL_TO`：收件地址，支持逗号分隔多个邮箱
- `REPORT_TIMEZONE`：报告时区，例如 `Asia/Hong_Kong`
- `MAX_PROJECTS`：单封邮件最多包含多少个项目
- `GITHUB_SEARCH_PAGES`：API 兜底搜索深度
- `LLM_MODEL`：默认摘要模型
- `DIGEST_OVERVIEW_MODEL`：总览模型
- `PROJECT_SUMMARY_MODEL`：项目摘要模型
- `REPEAT_COOLDOWN_DAYS`：重复抑制冷却期（默认 5 天）
- `REPEAT_WINDOW_DAYS`：重复抑制窗口（默认 14 天）
- `BREAKOUT_STAR_DELTA`：突破性回归阈值（默认 120）
- `JUYA_RSS_URL`：橘鸦 AI 日报 RSS 地址（默认 `https://imjuya.github.io/juya-ai-daily/rss.xml`）
- `JUYA_CONTENT_LIMIT`：新闻正文长度上限（默认 30000）
- `ENABLE_OFFICIAL_UPDATES`：是否启用官方动态抓取（OpenAI、GitHub、Cloudflare 等）
- `AUTHENTICITY_THRESHOLD`：真实性评分阈值（默认 12）
- `RELEASE_LOOKBACK_HOURS`：Release 回溯时间窗口（默认 72 小时）
- `MIN_DELIVERABLE_STAR_DELTA`：最小可交付星标增量（默认 5）
- `MIN_RESURFACE_STAR_GAIN`：重新浮现最小星标增长（默认 60）
- `MIN_RESURFACE_DAYS`：重新浮现最小间隔天数（默认 21 天）

### Secrets

- `RUN_SECRET`
- `GITHUB_TOKEN`
- `LLM_API_KEY`
- `LLM_API_BASE_URL`（可选，默认 `https://api.openai.com/v1`）

## Cloudflare 资源

部署前需要先创建并配置：

- `STATE` 对应的 KV Namespace
- 队列，例如 `github-digest-jobs`
- Email Routing 的目标邮箱
- `send_email` binding


## 部署步骤

1. 修改 `wrangler.toml` 中的必填项：
   - `[[kv_namespaces]]` 的 `id`：替换为你的 KV Namespace ID
   - `EMAIL_FROM`：你的发件地址
   - `EMAIL_TO`：你的收件地址
   - `LLM_MODEL` 等模型名称：根据你的 LLM 提供商填写
   - `[[send_email]]` 中的 `allowed_destination_addresses` 和 `allowed_sender_addresses`

2. 写入 Secrets：

```powershell
wrangler secret put RUN_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put LLM_API_KEY
```

3. 部署：

```powershell
wrangler deploy
```

## 接口说明

- `GET /health`
- `GET /last?secret=YOUR_SECRET`
- `GET /last-error?secret=YOUR_SECRET`
- `GET /run?secret=YOUR_SECRET`
- `GET /run?secret=YOUR_SECRET&force=1`
- `GET /run?secret=YOUR_SECRET&dry_run=1`

说明：

- 手动运行不会直接在 HTTP 请求里执行长任务
- `/run` 会把任务提交到 Queue，再由 consumer 在后台执行
- 这样可以避免长时间摘要任务被 HTTP 生命周期截断


## LLM 兼容性


只要服务端兼容 OpenAI Chat Completions 协议，并支持：

- `POST /chat/completions`
- Bearer Token 鉴权
- JSON 输出模式（或兼容的 JSON 文本输出）

就可以接入。

常见做法是：

- 直接使用 OpenAI
- 使用兼容 OpenAI API 的第三方网关
- 使用自建兼容层


