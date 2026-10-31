# opensocial

A CLI for posting to social platforms from local pipelines — cron jobs, scripts, CI —
using **your own** app credentials (BYO). No hosted service, no shared app, no dashboard.
State lives entirely in two local files: `~/.config/opensocial/config.json` (your app
credentials) and `~/.config/opensocial/accounts.json` (connected account tokens).

## Quickstart

```bash
pnpm install
pnpm -r build
```

Create `~/.config/opensocial/config.json` with credentials for the app(s) you registered
(see the platform setup guides below for how to get these):

```json
{
  "instagram": { "clientId": "...", "clientSecret": "..." },
  "tiktok": { "clientId": "...", "clientSecret": "...", "privacyLevel": "SELF_ONLY" },
  "linkedin": { "clientId": "...", "clientSecret": "..." },
  "x": { "clientId": "...", "clientSecret": "..." }
}
```

Env vars `OPENSOCIAL_INSTAGRAM_CLIENT_ID` / `OPENSOCIAL_INSTAGRAM_CLIENT_SECRET` (and the
TikTok equivalents) override the config file — useful for CI.

Connect an account (opens a browser, runs a one-shot OAuth callback on
`http://localhost:8976/callback`):

```bash
opensocial connect instagram
opensocial connect tiktok
opensocial connect linkedin
opensocial connect x
opensocial accounts
```

Post:

```bash
opensocial post --to instagram --text "hello from opensocial" --media ./photo.jpg
```

Exit code is `0` only if every target platform published successfully.

## Supported platforms (v1)

| Platform | Formats | Media ingestion | Notes |
|---|---|---|---|
| Instagram | image, carousel (≤10), Reel (single video) | public URL only | needs a business/creator account + [setup guide](docs/setup-instagram.md) |
| TikTok | video (≤64MB, direct upload), photos (1–35, public URL) | direct upload (video) / public URL (photos) | unaudited apps post `SELF_ONLY` — see [setup guide](docs/setup-tiktok.md) |
| LinkedIn | text, text + 1 image | direct upload | personal profile via the self-serve "Share on LinkedIn" product (`w_member_social`) — see [setup guide](docs/setup-linkedin.md) |
| X | text, text + 1 image (≤ 280 weighted chars, URLs count 23) | direct upload | OAuth 2.0 with PKCE; pay-per-use API (a post with a link costs ~13× one without) — see [setup guide](docs/setup-x.md) |

Both platforms cap caption/title at 2200 characters. `--media` accepts local file paths
or public URLs interchangeably; local files that a platform requires as a public URL are
uploaded to your own [media host](docs/media-host.md) and deleted after publishing.

## Pipeline example

```bash
#!/usr/bin/env bash
# generate-and-post.sh — run daily via cron
set -euo pipefail

TEXT="Daily update — $(date +%Y-%m-%d)"
IMAGE="/var/pipeline/out/today.jpg"

opensocial post --to instagram,tiktok --text "$TEXT" --media "$IMAGE"
```

```cron
0 9 * * * /var/pipeline/generate-and-post.sh >> /var/log/opensocial.log 2>&1
```

For multi-platform posts with per-platform text/media overrides, pipe a `Post` JSON
document instead:

```bash
echo '{"text":"default caption","media":[{"source":"a.jpg"}],"overrides":{"tiktok":{"text":"tiktok-specific caption"}}}' \
  | opensocial post --to instagram,tiktok --json
```

`--json` also switches the command's stdout to a JSON array of per-platform results
instead of a human-readable table.

## BYO friction — read before you build on this

Bringing your own app credentials means dealing with each platform's own onboarding, not
a pre-approved integration:

- **Instagram**: requires a business/creator account and a Meta app with the Instagram
  Login product. For personal use, dev mode + adding yourself as an Instagram Tester
  avoids app review entirely (~30 min setup). See [docs/setup-instagram.md](docs/setup-instagram.md).
- **TikTok**: apps start unaudited, which forces every post to `SELF_ONLY` visibility
  (only the poster can see it) regardless of the `privacyLevel` you set. Posting publicly
  requires submitting your app to TikTok's Content Posting API audit. See
  [docs/setup-tiktok.md](docs/setup-tiktok.md).
- **Local files on Instagram / TikTok photos**: both require a public URL, not a direct
  upload. Posting local files needs an S3-compatible media host you control. See
  [docs/media-host.md](docs/media-host.md).

None of this is optional polish — it's the actual cost of BYO credentials versus a hosted
service. The guides above walk through it once; after that it's `opensocial connect` and
`opensocial post`.

## Optional live smoke test

`packages/core/src/live.test.ts` posts a real image to a real connected Instagram account.
It's skipped by default and excluded from normal CI runs. To run it manually against a
test account:

```bash
OPENSOCIAL_LIVE_TEST=1 OPENSOCIAL_LIVE_IMAGE_URL=https://example.com/test.jpg pnpm test
```

## Roadmap

v1 (this repo) ships core + CLI for Instagram and TikTok, with OAuth, media host support,
and async media processing (`MediaJob` polling). Planned next, each its own spec/plan:

1. **v1 — Instagram + TikTok** (this repo)
2. X, Threads, LinkedIn, Facebook
3. Scheduling (SQLite queue + optional daemon)
4. Analytics (`stats`)
5. MCP server (thin layer over the core)
6. Comments / DMs

## Development

```bash
pnpm install
pnpm -r build
pnpm test
```

`packages/core` (`@opensocial/core`) holds all logic — types, config/accounts stores,
OAuth, media resolution, platform adapters, and the publish orchestrator. `packages/cli`
(`opensocial`) is a thin Commander wrapper over it.
