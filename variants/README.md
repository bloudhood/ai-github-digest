# Deployment Variants

This repository keeps one shared digest core at the root and two deployment variants under this directory.

- `net2-server/`: Node.js runner for net-2, using local file-backed state and Cloudflare Email Service REST API.
- `cloudflare-worker/`: Cloudflare Worker config examples, including the paused standby config and the archived automatic config.

Do not put production secrets, runtime state, logs, or private deployment configs in either variant directory. Use each variant's `.gitignore` and `.env.example` / `wrangler.*.example.toml` files as the boundary.
