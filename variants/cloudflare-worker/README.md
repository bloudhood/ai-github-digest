# Cloudflare Worker 版本

这个版本保留 Cloudflare Worker 部署形态，用于备用和回滚。

- `wrangler.paused.example.toml`：暂停备用配置，不包含 Cron 触发器和 Queue consumer。
- `wrangler.legacy-auto.example.toml`：旧自动配置存档，保留 Cron 触发器和 Queue consumer。
- `wrangler.local.toml`：本地部署配置。
