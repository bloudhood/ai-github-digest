# 服务器版本

这个版本通过 Node.js 运行仓库根目录的共享日报逻辑，适合部署在任意自托管服务器上。

## 文件

- `scripts/run-node.mjs`：手动和定时运行入口。
- `scripts/file-kv.mjs`：用本地 JSON 文件模拟 Worker KV。
- `scripts/cloudflare-email-rest.mjs`：Cloudflare Email Service REST 发信客户端。
- `systemd/github-digest.service`：一次性 systemd service 模板。
- `systemd/github-digest.timer`：每日定时器模板，默认 `03:58 UTC`，即香港时间 `11:58`。
- `.env.example`：脱敏环境变量模板。
