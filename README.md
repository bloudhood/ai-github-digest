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

普通变量（当前 `wrangler.toml`）：

- `EMAIL_FROM`: `digest@khaiise.com`
- `EMAIL_TO`: `abc1275132155@163.com,317770557@qq.com`
- `REPORT_TIMEZONE`: 默认 `Asia/Hong_Kong`
- `MAX_PROJECTS`: `15`
- `GITHUB_SEARCH_PAGES`: `2`
- `DEEPSEEK_MODEL`: `deepseek-reasoner`
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

1. 确认 `wrangler.toml` 指向生产 Worker `github-digest`、域名 `digest.khaiise.com`、KV、Queue 和 Email binding。
2. 在 Cloudflare 打开 Email Routing，并验证接收邮箱。
3. 确保发件地址属于你的域名，例如 `digest@khaiise.com`。
4. 配置 `send_email` binding。
5. 写入 Secret：

```powershell
npx -y wrangler secret put RUN_SECRET
npx -y wrangler secret put GITHUB_TOKEN
npx -y wrangler secret put DEEPSEEK_API_KEY
```

6. 部署：

```powershell
npm run check
npm test
npm run deploy:dry-run
npx -y wrangler deploy
```

## 手动接口

- `GET /health`
- `GET /last`
- `GET /last-error`
- `GET /run`
- `GET /run?dry_run=1`
- `GET /run?force=1`

受保护接口优先使用 `x-run-secret` header：

```powershell
$headers = @{ "x-run-secret" = "YOUR_SECRET" }
Invoke-RestMethod "https://digest.khaiise.com/last" -Headers $headers
Invoke-RestMethod "https://digest.khaiise.com/run?force=1" -Headers $headers
```

其中 `force=1` 会跳过“当天已发送”和“短期重复抑制”的限制，适合手动重跑。
非 `dry_run` 的 `/run` 默认把任务提交到 Queue 并返回 `202`；`dry_run=1` 会在当前请求内执行但不发信。
`?secret=` 仅在 `ALLOW_QUERY_RUN_SECRET=true` 时保留兼容；`direct=1` 仅在 `ENABLE_DIRECT_RUN=true` 时启用。

## 定时说明

`wrangler.toml` 当前写的是：

```toml
[triggers]
crons = ["0 4 * * *"]
```

Cloudflare Cron 使用 UTC，所以这表示每天 `04:00 UTC` 运行，也就是香港时间每天 `12:00`。

## 当前评分逻辑

评分是一个组合分数，不是只看总 stars：

- `star_delta_24h`: Trending 页抓到的当日增量，或与上一次快照相比的 stars 增量
- `velocity`: 新仓库的 stars / sqrt(age_days)
- `recencyBoost`: 最近 72 小时是否还在 push
- `forkSignal`: forks 是否同步增长
- `trendingRank`: GitHub Trending 当日榜排名加成；同时出现在 Trendshift 时有交叉确认加成
- `metadataBonus`: 描述、主页、语言等信息是否完整

候选集 = GitHub Trending（每日榜，全领域）∪ Trendshift ∪ Search（含两条全领域计划 + AI 主题计划）。
入选不要求与 AI 相关——目标是"每日真正的 GitHub 热点"；AI/新闻联动只作为加分项，不作为门槛。

如果你后面想改成更偏“投资雷达”或“AI 工具榜”，直接改 `buildSearchPlans()` 和 `rankCandidates()` 就行。

## 已知边界

- 第一次运行没有历史快照，所以 `star_delta_24h` 会是 0，主要靠兜底评分。
- GitHub Search 不是“全站实时热榜”，更像候选集入口。
- README 很长时会截前面一部分发给 DeepSeek；橘鸦新闻正文与条目默认不再截断，GitHub 项目默认上限为 20。
- Email 发送依赖 Cloudflare Email Routing 的已验证地址和绑定配置。
