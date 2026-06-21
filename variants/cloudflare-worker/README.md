# Cloudflare Worker Version

This variant preserves the Cloudflare Worker deployment shape while keeping production details out of git.

- `wrangler.paused.example.toml`: paused standby Worker config. It has no Cron trigger and no Queue consumer.
- `wrangler.legacy-auto.example.toml`: previous automatic Worker config with Cron and Queue consumer enabled.
- `wrangler.local.toml`: private deployment config copied from one of the examples. This file is ignored and must contain real domain, KV, sender, and recipient values locally only.

Do not deploy the legacy automatic config unless you intentionally want Cloudflare to resume automatic sends. Before re-enabling Cloudflare automation, verify queue consumers and Cron triggers so net-2 and Cloudflare do not send duplicate daily emails.
