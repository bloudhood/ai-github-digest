# GitHub Daily Digest Worker

这个日报现在有两种运行方式：

1. Cloudflare 版本保留为备用，但已安全暂停自动发送。
2. net-2 上的 Node 版本负责日常运行、发信和更细的日志。

两边执行的链路一致：

1. 调 GitHub API 拉取候选项目。
2. 用“24 小时 star 增量 + 新项目速度 + 最近 push 活跃度 + forks 信号”做排序。
3. 读取 Top 项目的 README 摘要。
4. 抓取 `https://daily.juya.uk/rss.xml` 的最新 RSS 日报。
5. 调 DeepSeek API 分两段生成日报：先做总览，再按小批次补全项目摘要。
6. 按版本通过 Cloudflare Worker binding 或 Cloudflare Email REST API 发出日报。

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

- `index.js`: 共享日报核心逻辑，Cloudflare Worker 与 net-2 runner 共用
- `state.js`: 共享状态读写辅助
- `variants/net2-server/`: net-2 Node/server 版本，包含 runner、systemd 模板、环境变量样例和本版本 ignore
- `variants/cloudflare-worker/`: Cloudflare Worker 版本，包含暂停版和旧自动版 wrangler 示例配置
- `test/`: 共享逻辑测试

## Cloudflare 备用能力

- Workers
- KV
- Email Routing
- Send Email binding
- 你的域名已托管在 Cloudflare

## 需要的变量和 Secret

普通变量：

- `EMAIL_FROM`: 发件地址，例如 `digest@example.com`
- `EMAIL_TO`: 逗号分隔的收件地址，例如 `recipient-primary@example.com,recipient-secondary@example.com`
- `REPORT_TIMEZONE`: 默认 `Asia/Hong_Kong`
- `MAX_PROJECTS`: `10`
- `GITHUB_SEARCH_PAGES`: `1`
- `DEEPSEEK_MODEL`: 默认 `deepseek-v4-flash`
- `DIGEST_OVERVIEW_MODEL`: 复杂总览使用 `deepseek-v4-pro`
- `PROJECT_SUMMARY_MODEL`: 单项目摘要使用 `deepseek-v4-flash`
- `DEEPSEEK_THINKING`: 默认 `enabled`
- `DIGEST_OVERVIEW_REASONING_EFFORT`: 总览默认 `max`
- `PROJECT_SUMMARY_REASONING_EFFORT`: 项目摘要默认 `high`
- `REPEAT_COOLDOWN_DAYS`: 默认 `5`
- `REPEAT_WINDOW_DAYS`: 默认 `14`
- `BREAKOUT_STAR_DELTA`: 默认 `120`
- `JUYA_RSS_URL`: 默认 `https://daily.juya.uk/rss.xml`
- `JUYA_CONTENT_LIMIT`: 默认 `30000`
- `AIHOT_ITEMS_TAKE`: AIHOT 候选抓取数量，默认 `30`
- AIHOT 补充新闻默认只合并 `4` 条，并按来源可信度、类别、分数和标题信号排序；Juya 主新闻渲染默认最多 `12` 条，AIHOT 补充最多 `4` 条。
- 底部“社媒与社区热榜”默认使用 NewsNow 中文热榜 + Hacker News front page；Reddit AI 走 `old.reddit.com` RSS 作为尽力而为补充源，失败不会影响邮件生成。
- `ALLOW_TEST_RECIPIENT_OVERRIDE`: 允许授权手动测试时用单个 `test_to` 收件人覆盖 `EMAIL_TO`

Secrets：

- `RUN_SECRET`: 手动触发 `/run` 和读取 `/last` 的密钥
- `TEST_RUN_SECRET`: 可选临时测试密钥，只通过 `x-run-secret` header 生效，用完后应删除
- `GITHUB_TOKEN`: 建议配置，避免 GitHub 未登录限流
- `DEEPSEEK_API_KEY`: DeepSeek API Key
- `DEEPSEEK_BASE_URL`: 可选，默认 `https://api.deepseek.com`

## net-2 部署步骤

1. 把仓库同步到 net-2，比如放到 `/home/ubuntu/github-digest/app`。
2. 把 `variants/net2-server/.env.example` 复制成 `/home/ubuntu/github-digest/.env`，填入 `DEEPSEEK_API_KEY`、`GITHUB_TOKEN`、`CLOUDFLARE_EMAIL_API_TOKEN`。
3. 把 Cloudflare KV 导出文件放到 `/home/ubuntu/github-digest/data/state.json`。
4. 安装 systemd unit：

```bash
sudo cp /home/ubuntu/github-digest/app/variants/net2-server/systemd/github-digest.service /etc/systemd/system/
sudo cp /home/ubuntu/github-digest/app/variants/net2-server/systemd/github-digest.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now github-digest.timer
```

5. 手动试跑：

```bash
node /home/ubuntu/github-digest/app/variants/net2-server/scripts/run-node.mjs --dry-run
node /home/ubuntu/github-digest/app/variants/net2-server/scripts/run-node.mjs --send --force
```

## Cloudflare 备用部署步骤

1. 复制 `variants/cloudflare-worker/wrangler.paused.example.toml` 为被 `.gitignore` 忽略的 `variants/cloudflare-worker/wrangler.local.toml`，再填入真实域名、KV ID、发件地址和收件地址。
2. 在 Cloudflare 打开 Email Routing，并验证接收邮箱。
3. 确保发件地址属于你的已验证域名。
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

Cloudflare 这边已经暂停 Cron 和 Queue consumer，不再自动发送。旧自动版配置保存在 `variants/cloudflare-worker/wrangler.legacy-auto.example.toml`，只作为归档/回滚参考。

net-2 的 systemd timer 默认每天 `03:58 UTC` 运行，对应香港时间 `11:58`。

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

如果你后面想改成更偏“投资雷达”或“AI 工具榜”，直接改 `buildSearchPlans()` 和 `rankCandidates()` 就行。

## 已知边界

- 第一次运行没有历史快照，所以 `star_delta_24h` 会是 0，主要靠兜底评分。
- GitHub Search 不是“全站实时热榜”，更像候选集入口。
- net-2 会把候选抓取页数、Trending 种子、低增量质量门槛调高，但最终邮件条数仍由 `MAX_PROJECTS` 控制。
- README 很长时会截前面一部分发给 DeepSeek；橘鸦新闻和 AIHOT 补充新闻有独立渲染预算，避免第二来源内容淹没主新闻；GitHub 项目默认上限为 10。
- HN / Reddit 等社区热榜属于增强信息源，外部网络失败时会跳过，不影响主邮件生成。
- Cloudflare REST 发信需要 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_EMAIL_API_TOKEN`，日志会单独记录每次发信尝试、接受时间和耗时。
