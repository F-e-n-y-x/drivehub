<div align="center">

# DriveHub

### Back up and sync your files between anywhere — from one clean web app.

Local · NAS · USB · S3 · Backblaze B2 · Google Drive · Dropbox · OneDrive · iCloud · WebDAV · SMB · SFTP · …any rclone backend

[![image](https://img.shields.io/badge/ghcr.io-drivehub-2496ED?logo=docker&logoColor=white)](https://github.com/F-e-n-y-x/drivehub/pkgs/container/drivehub)
[![CI](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml/badge.svg)](https://github.com/F-e-n-y-x/drivehub/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/F-e-n-y-x/drivehub?color=6366f1)](https://github.com/F-e-n-y-x/drivehub/releases)
[![MIT](https://img.shields.io/badge/license-MIT-informational)](LICENSE)

</div>

---

DriveHub is a self-hosted app for **backing up and syncing files between any two
places**. You add **storage** (a folder, a NAS, an S3 bucket, your Google Drive…),
then create a **job** that moves files from one to another — on a schedule, in
real time, or as versioned snapshots. It runs as a single Docker container and
uses [rclone](https://rclone.org) under the hood, so 70+ storage types work.

```bash
docker run -d --name drivehub -p 8080:8080 \
  -e TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e PUID=0 -e PGID=0 \
  -v /your/data:/data/sync -v ./drivehub:/data/app \
  ghcr.io/f-e-n-y-x/drivehub:latest
```

Open **http://localhost:8080** → add storage → create a job. Done.

---

## How it works

```
   Storage A  ──▶  [ Job: mirror / backup / two-way + a schedule ]  ──▶  Storage B
```

- **Storage** — anything you connect: a local/NAS/USB folder, S3, B2, Google
  Drive, Dropbox, OneDrive, iCloud, WebDAV, SMB, SFTP, or any other rclone
  backend via the **Custom** provider.
- **Job** — moves files from a source to a destination:
  - **Mirror** — make the destination an exact copy (deletions included).
  - **Backup** — copy new/changed files, never delete anything.
  - **Two-way** — keep both sides in sync.
  - **Snapshot** — versioned `.tar.gz` archives with “keep last N”.
- **Schedule** — real-time (watch a local folder), every N minutes, daily,
  weekly, or run by hand.

## What it’s good at

| You want to… | Do this |
| --- | --- |
| Back up photos/docs to the cloud | **Backup** job → S3 / B2 / Drive, daily |
| Keep a folder mirrored to a NAS | **Mirror** job → SMB / SFTP, real-time |
| Safely back up app data / databases | **Snapshot** job, daily, keep 7 (pauses containers for a clean copy) |
| Move data between two clouds | Job from one remote to another |

> **Tip:** don’t real-time-mirror live databases — a half-written file isn’t
> restorable. Use a **Snapshot** job instead.

## Setup

1. **Run it** (see the one-liner above, or use
   [`docker-compose.yml`](docker-compose.yml) / the
   [Portainer stack](portainer-stack.yml)).
2. **Add storage** in the UI. Cloud keys are entered there per remote — only
   Google Drive’s one-click sign-in needs `GOOGLE_CLIENT_ID/SECRET`
   (see [SETUP.md](SETUP.md)).
3. **Create a job** and let it run.

**Required env:** `TOKEN_ENCRYPTION_KEY` (encrypts stored credentials),
`PUBLIC_URL` (defaults to `http://localhost:8080`).
**Handy:** `PUID`/`PGID` (set to `0` to back up root-owned data like system
AppData). Full list in [`.env.example`](.env.example).

## Other backends & TeraBox

Beyond the built-in providers, the **Custom / other (advanced)** remote can
configure *any* rclone backend (pCloud, Mega, Koofr, Storj, Box, Yandex…) —
enter the rclone backend name plus its config keys.

**TeraBox** has no official API and no native rclone backend, so it only works
with a TeraBox-capable rclone build (e.g. an unofficial fork). To use it: mount
such a binary into the container and point `RCLONE_BIN` at it, then add a
**Custom** remote with backend `terabox`. DriveHub ships official rclone by
default and does not bundle forks.

## Features

- **Any backend** via rclone, incl. one-click Google Drive sign-in and a
  **Custom** provider for everything else
- **Jobs**: mirror / backup / two-way, on real-time / interval / daily / weekly
  schedules, plus **versioned snapshots** with retention (and optional
  Docker-container quiescing for consistent database backups)
- **Tabbed file explorer** — browse any remote with preview (image zoom/pan,
  PDF, video, audio, text), multi-select, copy/cut/paste **across tabs &
  remotes**, new folder/file, rename, delete, download
- **Per-remote details** — storage usage, account email, on-demand speed test,
  rename, and one-click Browse
- Live transfer progress, run history, searchable activity log, and a
  **Logs page** for diagnostics (toggle in Settings → Developer)
- Self-updates rclone from the UI; flags new DriveHub releases
- Encrypted credentials at rest · runs as a configurable user (`PUID`/`PGID`) ·
  brand-iconed, light/dark UI

## Develop

```bash
corepack enable && pnpm install
pnpm --filter @drivehub/types build
pnpm dev     # API on :8080, web on :5173
pnpm test    # engine unit tests
```

`packages/types` (shared contracts) · `packages/server` (API + rclone engine +
scheduler) · `packages/web` (React UI). Needs `rclone` on PATH for local runs;
the Docker image bundles it.

## Security

Credentials are encrypted with AES-256-GCM and the rclone config is rebuilt from
that store on boot. The container fixes mount ownership then drops privileges.
If you enable snapshot quiescing, mount the Docker socket read-only — it grants
control of the host’s Docker.

## License

[MIT](LICENSE) · Storage transfers powered by [rclone](https://rclone.org).
