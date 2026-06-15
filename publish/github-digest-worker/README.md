# AI GitHub 日报 Worker

一个基于 Cloudflare Workers 的 AI / GitHub 热门项目邮件系统。

它的目标不是做“全站绝对真值榜单”，而是稳定地输出一封**适合每天阅读的短期热门 AI 项目与行业动态邮件**。

## 项目特点

- 以 GitHub Trending 日榜作为主候选源
- 以 Trendshift 作为辅助候选源，补充上升中的仓库
- 优先关注短期星标爆发，而不是长期累计 stars
- 自动做候选合并、去重、家族聚合和风险过滤
- 接入外部 AI 新闻 RSS，并使用 DeepSeek 生成中文邮件摘要
- 通过 Cloudflare Queues 执行长任务，避免 HTTP 请求超时导致的失败
- 通过 Cloudflare Email Routing 直接发送邮件

## 适用场景

适合：

- 每天定时接收 AI / Agent / 编程工具领域的新热点
- 希望把 GitHub 热门项目、行业新闻和简短中文摘要整合在一起
- 希望整个系统部署在 Cloudflare 上，无需本地常驻运行

不适合：

- 需要“全 GitHub 精确 24 小时 star 排名”的场景
- 需要复杂后台数据库或可视化面板的场景

## 工作流程

每次执行时，系统会按顺序完成：

1. 抓取 GitHub Trending 日榜
2. 抓取 Trendshift 热门仓库
3. 合并两个网页源并做仓库级去重
4. 补充 GitHub 仓库元数据
5. 结合短期热度、项目类型、重复抑制和风险信号做筛选
6. 读取 AI 新闻 RSS
7. 调用 DeepSeek 生成中文邮件标题、总览、项目说明和新闻摘要
8. 通过 Cloudflare Email Routing 发信

## 技术栈

- Cloudflare Workers
- Cloudflare Queues
- Cloudflare KV
- Cloudflare Email Routing / `send_email`
- GitHub Trending 网页
- Trendshift 网页
- GitHub REST API
- DeepSeek API

## 目录说明

- `index.js`：Worker 主逻辑
- `wrangler.toml`：Cloudflare 部署配置模板
- `docs/ARCHITECTURE.md`：架构说明
- `docs/OPERATIONS.md`：运行与维护说明

## 部署前准备

你需要先准备：

- 一个 Cloudflare 账号
- 一个可发信的域名，并已接入 Cloudflare
- Cloudflare Email Routing
- 一个 KV Namespace
- 一个 Queue
- DeepSeek API Key
- 可选的 GitHub Token

## 配置说明

### 环境变量

- `EMAIL_FROM`：发件地址，例如 `digest@example.com`
- `EMAIL_TO`：收件地址，支持逗号分隔多个邮箱
- `REPORT_TIMEZONE`：报告时区，例如 `Asia/Hong_Kong`
- `MAX_PROJECTS`：单封邮件最多包含多少个项目
- `GITHUB_SEARCH_PAGES`：API 兜底搜索深度
- `DEEPSEEK_MODEL`：默认 `deepseek-v4-flash`
- `DIGEST_OVERVIEW_MODEL`：复杂总览使用 `deepseek-v4-pro`
- `PROJECT_SUMMARY_MODEL`：项目摘要使用 `deepseek-v4-flash`
- `DEEPSEEK_THINKING`：默认 `enabled`
- `DIGEST_OVERVIEW_REASONING_EFFORT`：总览默认 `max`
- `PROJECT_SUMMARY_REASONING_EFFORT`：项目摘要默认 `high`
- `REPEAT_COOLDOWN_DAYS`：重复抑制冷却期
- `REPEAT_WINDOW_DAYS`：重复抑制窗口
- `BREAKOUT_STAR_DELTA`：突破性回归阈值
- `JUYA_RSS_URL`：新闻 RSS 地址
- `JUYA_CONTENT_LIMIT`：新闻正文长度上限

### Secrets

- `RUN_SECRET`
- `GITHUB_TOKEN`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`（可选）

## Cloudflare 资源

部署前需要先创建并配置：

- `STATE` 对应的 KV Namespace
- 队列，例如 `github-digest-jobs`
- Email Routing 的目标邮箱
- `send_email` binding

注意：

- `EMAIL_TO` 里的所有收件地址，都必须先在 Cloudflare Email Routing 的 `Destination Address` 里完成验证

## 部署步骤

1. 根据你的环境修改 `wrangler.toml`
2. 写入 Secrets：

```powershell
wrangler secret put RUN_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put DEEPSEEK_API_KEY
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

## 当前设计取向

这个项目当前的设计重点是：

- 热门优先，而不是长期稳定项目优先
- GitHub Trending 为主，Trendshift 为辅
- 中文邮件体验优先
- 可维护性优于“理论上最精确的全站热榜”

## 发布前建议

如果你要公开到 GitHub，建议再检查一次：

- 是否已经补充合适的开源许可证
- `wrangler.toml` 中是否还包含真实资源 ID
- 默认发件地址和收件地址是否已经替换为占位值
- 文档中是否还保留你的私有部署细节
