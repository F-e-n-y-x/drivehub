# Audit dimensions — detailed checklists

Per-dimension hotspots for DriveHub. Read the dimension you're assigned; each
item is a place a real bug has lived or could live. Confirm against the code.

## 1. Security

- **rclone invocation**: every call must build an **argument array** passed to
  `spawn`/`execFile`-style APIs — never a concatenated shell string, never
  `{ shell: true }`. Grep `rclone.ts` for template literals flowing into the
  child process. User-controlled values (paths, remote names, cookies, custom
  backend params) must be args, not interpolated command text.
- **Path traversal**: `/api/fs`, `/api/fs/file`, and the remote browse/file
  endpoints take a `path` query. `/api/fs*` reads the **container filesystem
  directly** — confirm it's intentionally browse-only and that there's no write
  primitive hanging off it. (It's a single-user self-hosted inspector by design;
  note the exposure rather than calling it a bug, unless the user wants it
  sandboxed.)
- **Credentials**: stored encrypted (AES-256-GCM, `crypto.ts`, key from
  `TOKEN_ENCRYPTION_KEY`). Check: secrets never appear in `summary` maps, SSE
  payloads, logs, or `/api/*` responses. `SECRET_KEYS` should cover every secret
  field (pass, token, cookie, client_secret…). rclone.conf is rebuilt from the
  DB on boot — make sure it's written with tight perms and not served.
- **Custom / WebDAV / AList remotes**: a `custom` remote lets the user name any
  rclone backend + params — that's powerful by design. Just ensure params are
  obscured where rclone expects and not echoed back in plaintext.
- **Docker socket**: only mounted read-only and only for snapshot quiescing.
  Confirm no write/exec via it beyond pause/unpause.
- **Auth**: the app ships unauthenticated (LAN/single-user). Flag as a deploy
  note; only treat as a finding if the user wants multi-user/exposed.

## 2. Correctness / bugs

- **SSE** (`http/server.ts`): each client subscribes to the EventBus. Verify the
  listener is removed on `req`/socket close — otherwise emitters leak and memory
  grows. Check `reply.hijack()` paths end the response and `destroy()` the rclone
  child + stream on client abort (`req.raw.on('close')`).
- **Range streaming**: full-file requests stream 200 (reliable across backends);
  only genuine sub-ranges use `rclone cat --offset/--count`. Re-check the math
  (`start`/`end`/`416`) and that `Content-Length` matches the bytes actually
  sent.
- **Scheduler/runner**: concurrent runs of the same job, `realtime` watchers,
  ret62 + `nextRunAt` recompute, and what happens if a remote is deleted mid-run.
  Look for unhandled promise rejections and `void`ed awaits.
- **Settings plumbing**: concurrency / bwlimit / speedTestSizeMb must actually
  reach the rclone args (`runner.ts` commonArgs, `remotes.ts` speedTest) — a
  setting that's saved but ignored is a classic bug here.
- **DB**: better-sqlite3 is synchronous; ensure migrations/defaults are applied
  and JSON columns are parsed defensively.

## 3. Performance

- rclone flags: `--transfers`/`--checkers` from `concurrency`, `--bwlimit`,
  `--drive-chunk-size`, `--multi-thread-streams`. Confirm they're present and not
  overridden. iCloud uses a deliberately slow path (rate limits) — keep it.
- Repeated `rclone size`/`about` per request — there's a size cache (≈60s);
  verify it's actually hit and keyed correctly.
- Web: large lists (browser/file grid) should be keyed and memoized; avoid
  refetch storms from over-aggressive TanStack Query `refetchInterval`/staleTime.
  Bundle: the single >500 kB chunk is known — note code-splitting opportunities
  (route-level lazy) rather than treating it as a defect.

## 4. Dead code & weight

- Grep for exports with no importers, components never rendered, and API methods
  that POST to routes that no longer exist (these have appeared after feature
  removals — e.g. a stale `addTeraBox`). Verify with a usage search before
  deleting.
- `package.json` deps not referenced anywhere (check both server and web).
- Docker image: extra binaries/layers. The image bundles rclone-extra; make sure
  nothing reinstalls stock rclone or leaves build caches in the final stage.

## 5. Robustness / UX

- Every write route (`POST`/`PUT`/`PATCH`) should validate its body with Zod and
  return a structured `{ error, message }` on failure.
- Each async UI action needs visible loading + error states; a failed remote
  test / speed test / job should surface a human message, not a silent spinner.
- Distinguish "0" from "failed/unknown" in displays (e.g. speed-test `null` →
  "—", not "0 B/s").
- Interactive controls (icon-only buttons) need accessible labels.

## 6. Improvements / modernization

- **rclone-extra**: expose backends/flags it adds that aren't surfaced yet.
- **Streaming**: an rclone **VFS media cache** (`rclone mount`/`serve` with
  `--vfs-cache-mode`) would make large-video preview smooth instead of
  network-bound — biggest UX lever for the browser.
- **Jobs**: per-job concurrency, dry-run preview, notifications on failure.
- **Resilience**: health endpoint already exists — consider a readiness check
  and structured metrics.
- Frame each improvement as *today the code does X; propose Y; the benefit is Z*,
  so the user can judge cost/value. Don't propose rewrites for their own sake.
