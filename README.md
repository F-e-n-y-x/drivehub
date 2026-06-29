<div align="center">

# DriveHub

**Self-hosted, premium-UI backup & sync between any storage — local, NAS, S3, Backblaze B2, Google Drive, Dropbox, OneDrive, WebDAV, SFTP — powered by rclone.**

[![CI](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml/badge.svg)](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml)
[![Publish image](https://github.com/F-e-n-y-x/drivehub/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/F-e-n-y-x/drivehub/actions/workflows/docker-publish.yml)
[![GHCR image](https://img.shields.io/badge/ghcr.io-drivehub-2496ED?logo=docker&logoColor=white)](https://github.com/F-e-n-y-x/drivehub/pkgs/container/drivehub)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

DriveHub is a self-hosted web app that backs up and syncs your data between **any
two storage endpoints**. Configure storage **Remotes**, then create **Jobs** that
move data between them — on a schedule, in real time, or as versioned snapshots —
all from a clean, minimalist dashboard. It bundles [rclone](https://rclone.org)
as the transfer engine, so 70+ backends work out of the box.

## Concepts

- **Remote** — a storage endpoint: a **local folder / NAS / USB**, **S3 / MinIO /
  Wasabi**, **Backblaze B2**, **Google Drive**, **Dropbox**, **OneDrive**,
  **WebDAV / Nextcloud**, or **SFTP**.
- **Job** — moves data from a **source** remote to a **destination** remote with a
  **mode** and a **schedule**.

## Features

- 🔌 **Many backends** — Local/NAS/USB, S3-compatible, B2, Google Drive, Dropbox,
  OneDrive, WebDAV, SFTP (anything rclone supports).
- 🔁 **Sync modes** — **mirror** (exact copy, incl. deletions), **additive**
  (never deletes on the destination), **two-way** (bidirectional, conflict-aware).
- ⏱️ **Schedules** — **real time** (watch a local folder), every N minutes,
  daily, weekly, or manual.
- 🗄️ **Snapshot backups** — versioned `tar.gz` archives with **retention** (keep
  last N). The right way to back up live data like app databases.
- 🧊 **Consistent snapshots** — optionally **pause Docker containers** during a
  snapshot for DB-safe archives (mount the Docker socket).
- 🧭 **Remote browser** — browse any remote's folders; pick paths visually.
- 📊 **Live progress** — per-job transfer progress, speed and ETA over SSE; run
  history; searchable activity log.
- 🔐 **Encrypted credentials at rest** (AES-256-GCM); runs in Docker as a
  configurable user (`PUID`/`PGID`).
- 🌗 **Premium minimalist UI** — light/dark.

## Quick start

The pre-built image is on the GitHub Container Registry:

**📦 [`ghcr.io/f-e-n-y-x/drivehub`](https://github.com/F-e-n-y-x/drivehub/pkgs/container/drivehub)** &nbsp;·&nbsp; `latest` &nbsp;·&nbsp; `linux/amd64`, `linux/arm64`

```bash
docker pull ghcr.io/f-e-n-y-x/drivehub:latest
```

### Docker Compose

```bash
git clone https://github.com/F-e-n-y-x/drivehub.git
cd drivehub
cp .env.example .env
# Set TOKEN_ENCRYPTION_KEY (openssl rand -base64 32) and PUBLIC_URL.
docker compose up -d
```

Open <http://localhost:8080>, add a **Remote** (e.g. your Local folder + an S3
bucket), then create a **Job** between them. That's it.

> Only `TOKEN_ENCRYPTION_KEY` and `PUBLIC_URL` are required. Cloud credentials are
> entered in the UI per remote. Google Drive's one-click sign-in additionally
> needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — see [SETUP.md](SETUP.md).
> Dropbox/OneDrive accept a token from `rclone authorize` pasted in the UI.

### `docker run`

```bash
docker run -d --name drivehub \
  -p 8080:8080 \
  -e TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e PUBLIC_URL="http://localhost:8080" \
  -e PUID=0 -e PGID=0 \
  -v "$PWD/sync-folder:/data/sync" \
  -v "$PWD/app-data:/data/app" \
  --restart unless-stopped \
  ghcr.io/f-e-n-y-x/drivehub:latest
```

Backing up system data that's root-owned (e.g. CasaOS/ZimaOS `/DATA/AppData`)?
Set `PUID=0`/`PGID=0` so the app can read it. For DB-consistent snapshots, also
mount `-v /var/run/docker.sock:/var/run/docker.sock:ro` and list the containers
to pause on the job.

## Choosing the right job for the data

| Data | Recommended |
|---|---|
| Documents, photos, media | **mirror** or **two-way**, schedule realtime/daily |
| Offsite copy to cloud | **additive** to S3/B2 (never deletes), daily |
| **Live app data / databases** (AppData) | **Snapshot** job, daily, keep 7+, optionally quiescing the containers |

> Don't real-time-mirror live databases — copying a file mid-write isn't
> restorable. Use a **snapshot** job; that's what it's for.

## Configuration

See [.env.example](.env.example). Essentials:

| Variable | Required | Description |
|---|:--:|---|
| `TOKEN_ENCRYPTION_KEY` | ✅ | Encrypts stored remote credentials |
| `PUBLIC_URL` | ✅ | URL you reach the app at (OAuth redirect host) |
| `PUID` / `PGID` | | User the app runs as; `0` to back up root-owned data |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Only for Google Drive one-click sign-in |
| `CONCURRENCY` | | Parallel transfers (default `4`) |
| `RCLONE_BIN` | | Path to rclone (defaults to the bundled binary) |

## Development

```bash
corepack enable
pnpm install
pnpm --filter @drivehub/types build
pnpm dev          # server (8080) + web (5173)
pnpm test         # unit tests (reconcile schedule, crypto, ignore)
pnpm build
```

Monorepo: `packages/types` (shared contracts), `packages/server` (Fastify API +
rclone engine + scheduler), `packages/web` (React + Vite + Tailwind UI).
Requires the `rclone` binary on PATH for local runs (the Docker image bundles it).

**Stack:** Node 22 · TypeScript · Fastify · Zod · Drizzle + better-sqlite3 ·
rclone · node-tar · SSE · React · Vite · Tailwind v4 · shadcn-style UI ·
TanStack Query · Zustand.

## Security

- Remote credentials/tokens are encrypted at rest (AES-256-GCM); the rclone
  config is rebuilt from the encrypted store on startup.
- The container fixes mount ownership then drops to `PUID:PGID` via gosu.
- Mounting the Docker socket (for snapshot quiescing) grants control of the host
  Docker — mount it read-only and only if you use that feature.

## License

[MIT](LICENSE)
