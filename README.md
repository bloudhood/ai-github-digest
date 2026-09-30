# GitHub Daily Digest Worker

> **`server` 分支**：面向自托管服务器（Node.js + systemd 定时任务）的生产版本，同步自 2026-08-20 的线上代码。`main` 分支保留最初的 Cloudflare Workers 版本。

这个日报现在有两种运行方式：

1. Cloudflare 版本保留为备用，但已安全暂停自动发送。
2. 服务器上的 Node 版本负责日常运行、发信和更细的日志。

两边执行的链路一致：

1. 调 GitHub API 拉取候选项目。
2. 用“24 小时 star 增量 + 新项目速度 + 最近 push 活跃度 + forks 信号”做排序。
3. 读取 Top 项目的 README 摘要。
4. 抓取 Juya 日报与 AI HOT 精选 RSS，按事实去重并把增量信息归入统一主题。
5. 对允许正文再分发的 AI HOT 候选尽力补充一张内容图片；失败时退化为纯文本卡片。
6. 调 DeepSeek API 分两段生成日报：先做总览，再按小批次补全项目摘要。
7. 用 Cloudflare `send_email` 直接把日报发到你的邮箱。

Cloudflare 版本已经降级为备用，不再承担每日自动发送。

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
- `scripts/`: 服务器 Node runner、KV 文件存储、Cloudflare Email REST 发送适配器
- `ops/`: systemd service/timer 模板
- `.env.server.example`: 服务器环境变量样例
- `wrangler.toml`: Cloudflare 配置示例

## Cloudflare 备用能力

- Workers
- KV
- Email Routing
- Send Email binding
- 你的域名已托管在 Cloudflare

## 需要的变量和 Secret

普通变量（当前 `wrangler.toml`）：

- `EMAIL_FROM`: `digest@example.com`
- `EMAIL_TO`: `recipient-primary@example.com,recipient-secondary@example.com`
- `REPORT_TIMEZONE`: 默认 `Asia/Hong_Kong`
- `MAX_PROJECTS`: `10`
- `GITHUB_SEARCH_PAGES`: `1`
- `DEEPSEEK_MODEL`: 默认 `deepseek-v4-flash`
- `DIGEST_OVERVIEW_MODEL`: 总览默认使用 `deepseek-v4-flash`
- `PROJECT_SUMMARY_MODEL`: 单项目摘要使用 `deepseek-v4-flash`
- `DEEPSEEK_THINKING`: 全局兼容开关，默认 `enabled`
- `DIGEST_OVERVIEW_THINKING`: 总览默认 `enabled`，使用 `high` 完成跨新闻选题和主题归纳
- `PROJECT_SUMMARY_THINKING`: 项目摘要默认 `enabled`，使用 `high` 分析 README 与项目风险
- `DIGEST_OVERVIEW_REASONING_EFFORT`: 总览默认 `high`
- `PROJECT_SUMMARY_REASONING_EFFORT`: 项目摘要默认 `high`
- `PROJECT_REPEAT_COOLDOWN_DAYS`: 常规复推冷却期，默认 `30`
- `PROJECT_REPEAT_WINDOW_DAYS`: 近期重复统计窗口，默认 `30`
- `MIN_BREAKOUT_REPEAT_GAP_DAYS`: 重大二次增长的最短间隔，默认 `14`
- `MIN_RELEASE_REPEAT_GAP_DAYS`: 新正式版本允许复推的最短间隔，默认 `7`
- `MAX_REPEAT_PERCENT`: 推荐区复推项目占比上限，默认 `30`
- `BREAKOUT_STAR_DELTA`: 默认 `120`
- `DIGEST_PROCESSING_DEADLINE_UTC`: 本地定时任务的模型工作截止时间；到点后使用确定性本地摘要，不阻塞发信
- `JUYA_RSS_URL`: 默认 `https://daily.juya.uk/rss.xml`
- `JUYA_CONTENT_LIMIT`: 默认 `30000`
- `AIHOT_FEED_URL`: 默认 `https://aihot.virxact.com/feed.xml`，旧 `AIHOT_ITEMS_URL` 仅保留兼容读取。
- `AIHOT_ITEMS_TAKE`: 从精选 RSS 参与筛选的候选数量，默认 `50`。
- AI HOT 与 Juya 先按原文 URL 和事件标题融合；所有合格的独有内容都会进入统一候选池并归入对应主题，不在模型判断前截成固定的来源尾块。
- DeepSeek 基于完整融合候选的事实价值、来源权威性、新颖度、时效性和整体叙事选题。展示层把 Juya 与 AI HOT 分别聚成连续来源块；来源块及块内条目按有图优先、模型价值顺序次之排列。最终最多渲染 `12` 条非 AI HOT 新闻与 `4` 条 AI HOT 新闻；无效候选 ID 会被拒绝，模型失败时再使用确定性排序回退。
- 允许图片补全的 AI HOT 候选都会尝试提取一张内容图；入选后与 Juya 图片使用相同卡片宽度并保持原始宽高比，不裁剪、不放大超过邮件内容宽度。无图条目保留完整文本宽度且不显示占位图。
- 底部“社媒与社区热榜”默认使用 NewsNow 中文热榜 + Hacker News front page；Reddit AI 走 `old.reddit.com` RSS 作为尽力而为补充源，失败不会影响邮件生成。
- `ALLOW_TEST_RECIPIENT_OVERRIDE`: 允许授权手动测试时用单个 `test_to` 收件人覆盖 `EMAIL_TO`

Secrets：

- `RUN_SECRET`: 手动触发 `/run` 和读取 `/last` 的密钥
- `TEST_RUN_SECRET`: 可选临时测试密钥，只通过 `x-run-secret` header 生效，用完后应删除
- `GITHUB_TOKEN`: 建议配置，避免 GitHub 未登录限流
- `DEEPSEEK_API_KEY`: DeepSeek API Key
- `DEEPSEEK_BASE_URL`: 可选，默认 `https://api.deepseek.com`

## 服务器部署步骤

1. 把仓库同步到服务器，比如放到 `/opt/github-digest/app`。
2. 把 `.env.server.example` 复制成 `/opt/github-digest/.env`，填入 `DEEPSEEK_API_KEY`、`GITHUB_TOKEN`、`CLOUDFLARE_EMAIL_API_TOKEN`。
3. 把 Cloudflare KV 导出文件放到 `/opt/github-digest/data/state.json`。
4. 安装 systemd unit：

```bash
sudo cp /opt/github-digest/app/ops/github-digest.service /etc/systemd/system/
sudo cp /opt/github-digest/app/ops/github-digest.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now github-digest.timer
```

5. 手动试跑：

```bash
node /opt/github-digest/app/scripts/run-node.mjs --dry-run
node /opt/github-digest/app/scripts/run-node.mjs --send --force
```

## Cloudflare 备用部署步骤

1. 确认 `wrangler.toml` 指向生产 Worker `github-digest`、域名 `digest.example.com`、KV、Queue 和 Email binding。
2. 在 Cloudflare 打开 Email Routing，并验证接收邮箱。
3. 确保发件地址属于你的域名，例如 `digest@example.com`。
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
Invoke-RestMethod "https://digest.example.com/last" -Headers $headers
Invoke-RestMethod "https://digest.example.com/run?force=1" -Headers $headers
```

其中 `force=1` 会跳过“当天已发送”和“短期重复抑制”的限制，适合手动重跑。
非 `dry_run` 的 `/run` 默认把任务提交到 Queue 并返回 `202`；`dry_run=1` 会在当前请求内执行但不发信。
`?secret=` 仅在 `ALLOW_QUERY_RUN_SECRET=true` 时保留兼容；`direct=1` 仅在 `ENABLE_DIRECT_RUN=true` 时启用。

## 定时说明

Cloudflare 这边已经暂停 Cron 和 Queue consumer，不再自动发送。旧自动版配置保存在 `ops/cloudflare/wrangler.cloudflare-legacy-auto.toml`，只作为归档/回滚参考。

服务器的 systemd timer 每天 `03:35 UTC` 启动，`03:59 UTC` 停止模型工作并降级，生成完成后等待到 `04:00 UTC`（香港时间 `12:00`）发送。

## 当前评分逻辑

评分是一个组合分数，不是只看总 stars：

- `star_delta_24h`: Trending 页抓到的当日增量，或与上一次快照相比的 stars 增量
- `velocity`: 新仓库的 stars / sqrt(age_days)
- `recencyBoost`: 最近 72 小时是否还在 push
- `forkSignal`: forks 是否同步增长
- `trendingRank`: GitHub Trending 当日榜排名加成；同时出现在 Trendshift 时有交叉确认加成
- `metadataBonus`: 描述、主页、语言等信息是否完整

候选集 = GitHub Trending（每日榜）∪ Trendshift ∪ Search（AI 主题计划）。
入选要求与 AI 领域或当天新闻主题相关；Trending 热度仍作为加分项，但不再允许纯全领域热点单独入选。

项目推荐信号只使用最多 12 条主新闻、4 条 AI HOT 和官方更新；低上下文社交/60 秒标题不参与项目匹配。单个弱关键词不能单独让仓库入选，交易/套利机器人会被排除。

重复项目默认不在 30 天内再次出现；仅新正式版本、重大二次增长或 30 天后的实质更新可例外复推，且最终占比不超过 30%。每个技术领域最多入选 2 个项目，允许少于 10 个，不再放宽冷却期凑数。

总览与项目摘要并行执行，所有常规任务都使用 Flash，但按任务复杂度分配思考预算：总览和项目摘要启用 `high` 思考，输出上限分别为 12000 与每批 5000 token；纯标题翻译关闭思考。总览保留一次重试，项目摘要和翻译失败时直接使用本地兜底，避免低价值的整段重放。事实约束、选题规则和内容候选不缩减；每次响应都会在运行日志记录模型和 token usage，便于按真实消耗继续调优。README 最多抓取前 8 个入选项目。

如果你后面想改成更偏“投资雷达”或“AI 工具榜”，直接改 `buildSearchPlans()` 和 `rankCandidates()` 就行。

## 已知边界

- 第一次运行没有历史快照，所以 `star_delta_24h` 会是 0，主要靠兜底评分。
- GitHub Search 不是“全站实时热榜”，更像候选集入口。
- 服务器版会把候选抓取页数、Trending 种子、低增量质量门槛调高，但最终邮件条数仍由 `MAX_PROJECTS` 控制。
- README 很长时会截前面一部分发给 DeepSeek；橘鸦新闻和 AIHOT 补充新闻有独立渲染预算，避免第二来源内容淹没主新闻；GitHub 项目默认上限为 10。
- HN / Reddit 等社区热榜属于增强信息源，外部网络失败时会跳过，不影响主邮件生成。
- Cloudflare REST 发信需要 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_EMAIL_API_TOKEN`，日志会单独记录每次发信尝试、接受时间和耗时。
