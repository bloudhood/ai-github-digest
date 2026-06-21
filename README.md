# GitHub Daily Digest

AI / GitHub 日报邮件系统，包含共享核心和两个部署版本。

## 目录

- `index.js`、`state.js`：共享日报核心逻辑。
- `test/`：Worker 兼容测试。
- `variants/server/`：自托管 Node.js 版本，使用本地文件状态和 Cloudflare Email Service REST API 发信。
- `variants/cloudflare-worker/`：Cloudflare Worker 版本配置。

## 功能

- 从 GitHub Trending、Trendshift、GitHub Search 收集候选项目。
- 按近期 star 增长、活跃度、主题相关性、重复推送历史等信号排序。
- 合并 Juya RSS、AIHOT、官方动态和社区热榜作为新闻上下文。
- 使用 DeepSeek 生成中文日报。
- 根据部署版本，通过 Cloudflare Worker Email binding 或 Cloudflare Email REST API 发信。

## 常用命令

```powershell
npm run check
npm test
npm run node:dry-run
npm run cloudflare:deploy:dry-run
```

## 注意

- 服务器版本可以扩大候选池，但最终邮件数量仍由 `MAX_PROJECTS` 控制。
- Cloudflare Worker 版本保留为备用和回滚参考。
