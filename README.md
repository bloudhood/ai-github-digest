# GitHub Daily Digest Worker

这个 Worker 会每天自动执行下面这条链路：

1. 调 GitHub API 拉取候选项目。
2. 用“24 小时 star 增量 + 新项目速度 + 最近 push 活跃度 + forks 信号”做排序。
3. 读取 Top 项目的 README 摘要。
4. 抓取 `https://imjuya.github.io/juya-ai-daily/` 的最新 RSS 日报。
5. 调 DeepSeek API 分两段生成日报：先做总览，再按小批次补全项目摘要。
6. 用 Cloudflare `send_email` 直接把日报发到你的邮箱。

这意味着它可以完全跑在 Cloudflare 上，不需要你的电脑保持开机。

## 为什么这样做

如果你想精确得到“今天 star 增长最快”的项目，纯靠 GitHub 单次搜索并不可靠，因为 GitHub 没有直接给出“全站任意仓库最近 24 小时新增多少 stars”的简单榜单接口。

这个 Worker 采用更稳的办法：

- 每天抓取一批高潜力候选仓库。
- 把当天 stars 快照存进 Cloudflare KV。
- 第二天再次抓取时，用 `当前 stars - 昨日 stars` 算 `star_delta_24h`。
- 当没有历史快照时，用新项目增速和活跃度做兜底排序。

这不是全 GitHub 的绝对真值榜单，但对“每天发现值得关注的新项目”更实用，也更适合 Worker 的请求额度和执行时间。

此外，Worker 现在会记录最近推送历史，默认对短期重复出现的仓库做冷却抑制：

- 默认 `5` 天冷却。
- 默认 `14` 天窗口内同一仓库最多推送 `2` 次。
- 如果当天 star 增量特别大，会触发 `breakout override`，允许再次入选。

## 目录

- `index.js`: Worker 主逻辑
- `wrangler.toml`: Cloudflare 配置示例

## 需要的 Cloudflare 能力

- Workers
- Cron Triggers
- KV
- Email Routing
- Send Email binding
- 你的域名已托管在 Cloudflare

## 需要的变量和 Secret

普通变量：

- `EMAIL_FROM`: 例如 `digest@example.com`
- `EMAIL_TO`: 你要接收日报的邮箱
- `REPORT_TIMEZONE`: 默认 `Asia/Hong_Kong`
- `MAX_PROJECTS`: 默认 `20`
- `GITHUB_SEARCH_PAGES`: 默认 `1`
- `DEEPSEEK_MODEL`: 默认 `deepseek-chat`
- `REPEAT_COOLDOWN_DAYS`: 默认 `5`
- `REPEAT_WINDOW_DAYS`: 默认 `14`
- `BREAKOUT_STAR_DELTA`: 默认 `120`
- `JUYA_RSS_URL`: 默认 `https://imjuya.github.io/juya-ai-daily/rss.xml`
- `JUYA_CONTENT_LIMIT`: 默认 `30000`

Secrets：

- `RUN_SECRET`: 手动触发 `/run` 和读取 `/last` 的密钥
- `GITHUB_TOKEN`: 建议配置，避免 GitHub 未登录限流
- `DEEPSEEK_API_KEY`: DeepSeek API Key
- `DEEPSEEK_BASE_URL`: 可选，默认 `https://api.deepseek.com`

## 部署步骤

1. 创建 KV Namespace，并把 ID 填进 `wrangler.toml`。
2. 把 `digest.example.com` 改成你想要的子域名。
3. 在 Cloudflare 打开 Email Routing，并验证你的接收邮箱。
4. 确保发件地址属于你的域名，例如 `digest@example.com`。
5. 配置 `send_email` binding。
6. 写入 Secret：

```powershell
wrangler secret put RUN_SECRET
wrangler secret put GITHUB_TOKEN
wrangler secret put DEEPSEEK_API_KEY
```

7. 部署：

```powershell
wrangler deploy
```

## 手动接口

- `GET /health`
- `GET /last?secret=YOUR_SECRET`
- `GET /run?secret=YOUR_SECRET`
- `GET /run?secret=YOUR_SECRET&dry_run=1`
- `GET /run?secret=YOUR_SECRET&force=1`
- `GET /run?secret=YOUR_SECRET&force=1&async=1`

其中 `force=1` 会跳过“当天已发送”和“短期重复抑制”的限制，适合手动重跑。
`async=1` 会立即返回 `202`，后台继续生成并发送，适合摘要较长时避免前端连接超时。

## 定时说明

`wrangler.toml` 当前写的是：

```toml
[triggers]
crons = ["0 4 * * *"]
```

Cloudflare Cron 使用 UTC，所以这表示每天 `04:00 UTC` 运行，也就是香港时间每天 `12:00`。

## 当前评分逻辑

评分是一个组合分数，不是只看总 stars：

- `star_delta_24h`: 与上一次快照相比的 stars 增量
- `velocity`: 新仓库的 stars / sqrt(age_days)
- `recencyBoost`: 最近 72 小时是否还在 push
- `forkSignal`: forks 是否同步增长
- `metadataBonus`: 描述、主页、语言等信息是否完整

如果你后面想改成更偏“投资雷达”或“AI 工具榜”，直接改 `buildSearchPlans()` 和 `rankCandidates()` 就行。

## 已知边界

- 第一次运行没有历史快照，所以 `star_delta_24h` 会是 0，主要靠兜底评分。
- GitHub Search 不是“全站实时热榜”，更像候选集入口。
- README 很长时会截前面一部分发给 DeepSeek；橘鸦新闻正文与条目默认不再截断，GitHub 项目默认上限为 20。
- Email 发送依赖 Cloudflare Email Routing 的已验证地址和绑定配置。
