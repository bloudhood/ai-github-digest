# net-2 Server Version

This variant runs the shared digest logic from the repository root through a Node.js runner on net-2.

## Files

- `scripts/run-node.mjs`: Node entrypoint for manual and scheduled runs.
- `scripts/file-kv.mjs`: local file-backed KV replacement for Worker KV.
- `scripts/cloudflare-email-rest.mjs`: Cloudflare Email Service REST client.
- `systemd/github-digest.service`: one-shot systemd service template.
- `systemd/github-digest.timer`: daily timer template, set to 03:58 UTC / 11:58 Asia/Hong_Kong.
- `.env.example`: sanitized environment template.

## Private Runtime Files

Keep these outside git:

- `/home/ubuntu/github-digest/.env`
- `/home/ubuntu/github-digest/data/state.json`
- `/home/ubuntu/github-digest/logs/*.jsonl`

The `.env.example` file intentionally uses placeholder addresses and IDs.
