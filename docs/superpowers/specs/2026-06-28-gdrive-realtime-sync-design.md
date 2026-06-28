# Design Spec — Dockerized Real-Time Google Drive Sync App

**Date:** 2026-06-28
**Status:** Approved (design) → ready for implementation plan
**Working name:** DriveHub (placeholder, can rename)

---

## 1. Summary

A self-hosted, Dockerized web application that keeps a single local folder (the
"hub") synchronized in **real time, two-way**, with **one or more Google Drive
accounts**. It ships with Google sign-in, a Google Drive folder viewer, and a
premium minimalist web UI. The local hub is the source of truth; every connected
Drive account is a two-way replica "spoke", so all accounts converge to the same
content.

This fills a real gap: rclone is CLI-first, RcloneView is a desktop two-pane
explorer, Insync/odrive are closed-source desktop apps, and Syncthing/Seafile/
Nextcloud *replace* Drive rather than sync *into* an existing Google Drive. None
provide a clean, self-hosted **web** app that mirrors a local folder into real
Google Drive accounts in real time.

---

## 2. Goals & non-goals

### Goals (MVP)
- Real-time two-way sync between one local hub folder and N Google Drive accounts.
- Google OAuth sign-in; add/remove multiple accounts (single operator).
- Drive folder viewer with per-file sync-status badges.
- Premium, minimalist, responsive web UI (light/dark).
- Safe by default: keep-both conflict handling, delete-to-trash, encrypted tokens.
- One-command deploy via Docker Compose.

### Non-goals (now)
- Multi-tenant user accounts / sharing between different people.
- Replacing Google Drive storage or providing its own storage backend.
- Mobile native apps.
- Real-time push webhooks (deferred to Phase 2; polling used in MVP).

---

## 3. Topology — Hub & Spoke

```
                  +-----------------------------+
   Local hub  <-->|   Sync Engine (the brain)   |<--> Google Drive  (Account A)
   /data/sync     |  - reconciler + job exec    |<--> Google Drive  (Account B)
   (Docker vol)   |  - SQLite sync-state store  |<--> Google Drive  (Account C)
                  +-----------------------------+
```

- **Local folder = source of truth (hub).**
- Each connected Drive account two-way-syncs against the hub (a "spoke").
- A change anywhere (local FS, or any Drive) flows into the hub and fans out to
  all other spokes. All accounts + the hub converge to identical content.

---

## 4. Architecture

### 4.1 Process / container layout
- **`app` container** — Node 22 LTS + TypeScript + Fastify. Serves:
  - REST API (UI commands: connect account, pause, resolve conflict, settings).
  - **SSE** stream (server→browser realtime: sync events, activity, status).
  - The built React UI as static assets.
  - Background sync engine (in-process workers).
- **SQLite** — a file on a mounted volume; no separate DB container.

### 4.2 Volumes
| Host | Container | Purpose |
|---|---|---|
| `./sync-folder` | `/data/sync` | The hub folder being synced |
| `./app-data` | `/data/app` | SQLite DB, encrypted tokens, logs |

### 4.3 Repository layout (pnpm monorepo)
```
/                     pnpm workspace root
  packages/
    types/            shared TS types (SyncStatus, Account, FileNode, ...)
    server/           Fastify backend + sync engine
    web/              React + Vite frontend
  docker/             Dockerfile, compose, entrypoint
  docs/superpowers/specs/
  SETUP.md            Google Cloud OAuth setup walkthrough
```

---

## 5. Sync engine (core)

Three producers feed one executor, mediated by the reconciler and a SQLite
sync-state store.

### 5.1 Producers
1. **Local watcher** — `chokidar` on `/data/sync`, debounced ~1s to coalesce
   editor saves. Emits create/change/delete with relative path.
2. **Drive pollers** — one per account. Calls Drive `changes.list` with a saved
   `startPageToken` every ~5–10s (configurable). Cheap *delta* feed, not a full
   rescan. Near-real-time with no inbound URL required.
3. **Startup full-reconcile** — on boot, walk hub + each Drive folder once to
   catch anything changed while the app was down.

### 5.2 Sync-state store (SQLite + Drizzle ORM)
One row per relative path capturing the last known *synced* truth plus per-account
remote identity.

```
items
  id               pk
  rel_path         text  unique         -- path relative to hub root
  type             enum  file|folder
  local_hash       text                 -- md5 of last-synced local content
  local_size       int
  local_mtime      int
  deleted          bool

item_remotes
  id               pk
  item_id          fk -> items
  account_id       fk -> accounts
  drive_file_id    text
  remote_hash      text                 -- Drive md5Checksum
  remote_modified  int
  state            enum synced|pending|conflict|error

accounts
  id               pk
  email            text
  refresh_token    blob                 -- AES-256-GCM encrypted
  start_page_token text                 -- per-account Drive changes cursor
  status           enum active|paused|error
  quota_used       int
  quota_total      int

operations            -- durable job log (crash-safe)
  id               pk
  kind             enum upload|download|delete_local|delete_remote|mkdir
  rel_path         text
  account_id       fk nullable
  attempts         int
  status           enum pending|running|done|failed
  error            text
```

### 5.3 Reconciler (decision-maker)
For each changed path, compare three states: **local** (mtime+md5),
**last-synced** (items + item_remotes), **remote** (Drive md5/modifiedTime).
Decision matrix yields exactly one of:
- `upload` (local newer / new locally) → to every account lacking latest.
- `download` (remote newer / new remotely) → into hub.
- `delete_remote` / `delete_local` (delete propagation; move-to-trash).
- `conflict` (both sides changed since last sync) → keep-both.
- `noop` (echo of engine's own write — see loop prevention).

Decisions are written to the `operations` log, then executed.

### 5.4 Executor
- In-memory `p-limit` pool (configurable concurrency) drains `operations`.
- Resumable uploads for large files (Drive resumable upload protocol).
- Exponential backoff on 403/429 rate-limit responses.
- **Durability comes from state, not the queue:** because every needed action is
  derivable from local vs last-synced vs remote state, a crash mid-sync is
  harmless — on restart the reconciler recomputes remaining work and replays the
  `operations` log. The in-memory pool is just an executor.

### 5.5 Loop prevention (critical)
When the engine writes a downloaded file into the hub, chokidar *will* fire. We
suppress the echo by comparing the event's content hash against the `local_hash`
we just recorded in `items`. Match → echo, `noop`. Mismatch → genuine user edit.
This prevents infinite fan-out loops across spokes.

### 5.6 Conflicts (keep-both)
If a path changed on **both** local and a remote since last sync: keep local
as-is; save the remote copy as
`name (conflict 2026-06-28 from <email>).ext` in the hub; mark both rows
`conflict`; surface in the Conflicts page. Nothing is ever silently lost.

### 5.7 Deletes
Propagate as **move-to-Drive-Trash** (recoverable) and OS-trash/soft-delete
locally where possible; never hard-delete. A settings toggle can disable
delete-propagation entirely (additive-only safety mode).

---

## 6. Google auth & accounts

- OAuth 2.0 via `googleapis`. Operator creates a Google Cloud project once,
  enables the Drive API, creates an OAuth client (Web), and sets client ID/secret
  in `.env`. `SETUP.md` provides a step-by-step walkthrough.
- **Scope:** `https://www.googleapis.com/auth/drive` (full) — required to
  read/write existing Drive folders and power the viewer. For personal
  self-hosted use the app stays in Google "testing" mode with the operator as a
  test user; no Google verification review required.
- **Add-account flow:** click → Google consent → redirect → store refresh token
  **encrypted at rest** (AES-256-GCM via `node:crypto`, key from `.env`
  `TOKEN_ENCRYPTION_KEY`). Repeat for additional accounts.
- Each account surfaces: email, avatar, storage quota, sync status, last delta
  time, disconnect.

---

## 7. Web UI

**Stack:** React + Vite + Tailwind v4 + shadcn/ui + TanStack Query + Zustand,
built on a token-based design system (Linear/Vercel-grade; no neon/glassmorphism/
emoji). Light/dark, responsive.

**Screens:**
- **Dashboard** — live sync status, throughput, last activity, per-account health
  cards, streamed activity feed (SSE).
- **Accounts** — connect/manage Google accounts.
- **Drive Viewer** — browse each account's Drive folder tree; per-file
  sync-status badges (synced / pending / conflict / error); search; breadcrumbs.
- **Activity & Logs** — searchable timeline of every sync action.
- **Conflicts** — review/resolve conflict copies.
- **Settings** — hub path, ignore patterns (`.gdrivesyncignore`), poll interval,
  delete-propagation toggle, concurrency, theme, global pause/resume.
- **First-run setup wizard** — OAuth → first account → confirm hub folder.

**Realtime:** SSE for all server→browser updates; REST for browser→server
commands.

---

## 8. Feature set

### MVP
Real-time two-way hub-spoke sync · multi-account · keep-both conflicts · Drive
viewer with status badges · ignore patterns · pause/resume · delete-to-trash ·
resumable large uploads · live activity feed · setup wizard · encrypted token
storage · light/dark.

### Phase 2 (data model shaped for it; deferred — YAGNI now)
Bandwidth throttling · per-account selective sub-folders · Drive revision/version
history viewer · push-webhook real-time when a public URL exists · Prometheus
`/metrics` + health checks · email/webhook alerts on errors · PWA/mobile ·
optional client-side filename encryption · scheduled quiet hours.

---

## 9. Tech stack

**Backend:** Node 22 LTS · Fastify · Zod · Drizzle ORM + better-sqlite3 ·
chokidar · googleapis · `p-limit` · SSE · `node:crypto` (AES-256-GCM).
**Frontend:** React · Vite · Tailwind v4 · shadcn/ui · TanStack Query · Zustand.
**Tooling:** pnpm workspaces · TypeScript project references · Vitest ·
Playwright · multi-stage Docker + docker-compose.

**Rationale highlights:**
- Node LTS over Bun — reliability of native fs-watch + SQLite for a sync daemon.
- SSE over WebSocket — UI updates are one-way server→browser; SSE auto-reconnects
  and avoids socket-lifecycle bugs.
- Drizzle ORM — type-safe queries over the sync-state schema (reconciler safety).
- Zod — validate config, API bodies, **and Drive API response shapes** before
  they touch sync state.
- Durability from state, not an in-memory queue.

---

## 10. Testing & quality

- **Unit (Vitest):** reconciler decision matrix (local × remote × last-synced →
  expected action), conflict naming, ignore-pattern matching, loop-suppression,
  token encryption round-trip.
- **Integration:** Drive API mocked; drive the full engine through
  create/edit/delete/conflict/echo scenarios end-to-end against a temp hub +
  in-memory SQLite.
- **E2E (Playwright):** OAuth stub → add account → drop a file in hub → see it
  appear in the viewer as "synced"; edit-on-both → conflict copy appears.
- Engine built test-first (test-driven-development).

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Two-way reconciler bugs (the weight-bearing wall) | State-based design + exhaustive decision-matrix unit tests; TDD |
| Fan-out loops across spokes | Hash-echo suppression (§5.5) |
| Drive API rate limits | Backoff, batched changes feed, concurrency cap |
| Token leakage | AES-256-GCM at rest; key only in env; never logged |
| Data loss on conflict/delete | Keep-both + move-to-trash; delete-propagation toggle |
| Crash mid-sync | Durable `operations` log + startup full-reconcile |
| Large files / quota | Resumable uploads; quota surfaced per account |

---

## 12. Open items to confirm before/while planning
- Final product name (placeholder: **DriveHub**).
- Default poll interval (proposed: 7s).
- Default concurrency (proposed: 4 parallel transfers).
