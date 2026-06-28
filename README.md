<div align="center">

# DriveHub

**Self-hosted, real-time, two-way sync between a local folder and your Google Drive accounts — with a premium web UI.**

[![CI](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml/badge.svg)](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml)
[![Publish image](https://github.com/F-e-n-y-x/drivehub/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/F-e-n-y-x/drivehub/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

DriveHub watches a folder on your machine and keeps it in sync with **one or more
Google Drive accounts** in real time — both directions. Drop a file in the folder
and it appears in every connected Drive within seconds; edit it from Drive and the
change flows back. It runs as a single Docker container and ships with a clean,
minimalist dashboard, a Google Drive folder viewer, and safe-by-default conflict
handling.

## Why DriveHub?

The usual options each miss something:

| Tool | Gap |
|---|---|
| **rclone** | Powerful engine, but CLI-only — no real-time, no UI |
| **RcloneView** | Desktop two-pane explorer, not a self-hosted web app |
| **Insync / odrive** | Closed-source, freemium desktop apps |
| **Nextcloud / Seafile / Syncthing** | *Replace* Drive instead of syncing *into* your real Google Drive |

DriveHub is the missing piece: a **self-hosted web app** that mirrors a local
folder into your **actual Google Drive** in real time.

## How it works — Hub & Spoke

The local folder is the **hub** (source of truth). Each connected Google account
is a two-way **spoke**. A change anywhere flows into the hub and fans out to every
other spoke, so all accounts converge to identical content.

```
   Local hub  <-->  Sync Engine  <-->  Google Drive (Account A)
   /data/sync         (brain)     <-->  Google Drive (Account B)
                                   <-->  Google Drive (Account C)
```

The engine compares three states for every path — **local now**, **last-synced**,
and **remote now** — and converges them. Durability lives in SQLite, so a restart
simply resumes from current state.

## Features

- 🔄 **Real-time two-way sync** — instant local watcher + efficient Drive delta polling
- 👥 **Multiple Google accounts** — connect as many as you like; all stay in sync
- 🧭 **Drive folder viewer** — browse each account's Drive with per-file sync badges
- 🛟 **Keep-both conflicts** — never lose data; divergent edits are saved side-by-side
- 🗑️ **Safe deletes** — propagated as Drive *trash* (recoverable), or disable entirely
- 🚦 **Pause/resume**, ignore patterns (`.gitignore`-style), tunable concurrency & poll rate
- 🔐 **Encrypted tokens at rest** (AES-256-GCM), non-root container
- 🌗 **Premium minimalist UI** — light/dark, live activity feed over SSE
- 🐳 **One-command Docker deploy**

## Quick start

> Prerequisites: Docker + a Google Cloud OAuth client. The OAuth client takes
> ~5 minutes to set up — follow **[SETUP.md](SETUP.md)**.

```bash
git clone https://github.com/F-e-n-y-x/drivehub.git
cd drivehub
cp .env.example .env
# Edit .env: paste your GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET,
# and set TOKEN_ENCRYPTION_KEY  (openssl rand -base64 32)
docker compose up -d
```

Open <http://localhost:8080>, click **Connect Google Account**, and pick the
folder mapping. Drop a file into `./sync-folder` and watch it sync.

## Configuration

All configuration is via environment variables — see **[.env.example](.env.example)**.
The essentials:

| Variable | Required | Description |
|---|:--:|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✅ | OAuth client from Google Cloud |
| `TOKEN_ENCRYPTION_KEY` | ✅ | Secret used to encrypt refresh tokens |
| `PUBLIC_URL` | ✅* | Public URL of the app; the OAuth redirect host must match |
| `POLL_INTERVAL_MS` | | Drive change-poll interval (default `7000`) |
| `CONCURRENCY` | | Max parallel transfers (default `4`) |
| `DELETE_PROPAGATION` | | `false` = additive-only (local deletes don't delete from Drive) |

\* Defaults to `http://localhost:8080` for local use.

## Development

```bash
corepack enable
pnpm install
pnpm --filter @drivehub/types build
pnpm dev          # runs server (8080) + web (5173, proxies /api) together
pnpm test         # engine unit tests (reconciler matrix, conflict naming, crypto, ignore)
pnpm build        # build all workspaces
```

Monorepo layout:

```
packages/types     shared TypeScript contracts (server <-> web)
packages/server    Fastify API + the sync engine
packages/web       React + Vite + Tailwind dashboard
docker/            Dockerfile
docs/              design spec
```

## Architecture & design

The full design — topology, the reconciler decision matrix, loop prevention,
conflict handling, and the durable operation log — lives in
[docs/superpowers/specs/2026-06-28-gdrive-realtime-sync-design.md](docs/superpowers/specs/2026-06-28-gdrive-realtime-sync-design.md).

**Stack:** Node 22 · TypeScript · Fastify · Zod · Drizzle ORM + better-sqlite3 ·
chokidar · googleapis · SSE · React · Vite · Tailwind v4 · shadcn-style UI ·
TanStack Query · Zustand.

## Security notes

- Refresh tokens are encrypted at rest with AES-256-GCM; the key never leaves env.
- The container runs as a non-root user.
- For personal self-hosting, keep the Google OAuth app in **testing** mode with
  yourself as a test user — no Google verification review needed.
- Deletes move to Drive **trash** (recoverable). Set `DELETE_PROPAGATION=false`
  for a purely additive backup.

## Roadmap (Phase 2)

Bandwidth throttling · per-account selective sub-folders · Drive revision/version
history viewer · push-webhook real-time when a public URL exists · Prometheus
`/metrics` · email/webhook alerts · PWA/mobile · optional client-side filename
encryption.

## License

[MIT](LICENSE)
