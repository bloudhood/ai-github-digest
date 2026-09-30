# Cloudflare Worker Versions

These files preserve Cloudflare-side configurations for rollback/reference.

- `wrangler.cloudflare-legacy-auto.toml`: the previous automatic Cloudflare Worker version with Cron and Queue consumer enabled.
- The root `wrangler.toml` remains the paused Cloudflare standby config. Do not deploy the legacy file unless you intentionally want Cloudflare to resume automatic sends.

Before re-enabling Cloudflare automation, verify queue consumers and Cron triggers so the server and Cloudflare do not send duplicate daily emails.
