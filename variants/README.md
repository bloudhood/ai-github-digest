# 部署版本

仓库根目录保留一份共享日报核心逻辑，`variants/` 下只放部署适配层。

- `server/`：自托管 Node.js 版本，使用本地文件状态和 Cloudflare Email Service REST API。
- `cloudflare-worker/`：Cloudflare Worker 版本配置，保留暂停备用配置和旧自动配置存档。
