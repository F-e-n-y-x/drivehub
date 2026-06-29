---
name: audit
description: Run a thorough audit of the DriveHub codebase (or any TypeScript/Node + React + rclone + Docker app in this repo) to find bugs, security issues, performance problems, dead code, and concrete tech/feature improvements. Use this whenever the user asks to "audit", "review the whole project", "find bugs / issues / improvements", "make it lighter / faster", "is this production-ready", "what's missing", or wants a health-check before a release — even if they don't say the word "audit". Produces a severity-ranked report with file:line evidence and proposed fixes.
---

# Audit

A reusable methodology for auditing this repo. The goal is a **trustworthy,
severity-ranked report** with concrete evidence (`file:line`) and a proposed fix
for each finding — not a vague list of "consider maybe". Every claimed bug must
be traced to real code, and every "improvement" must be justified by what the
code actually does today.

## What this repo is (orient first)

DriveHub — a self-hosted, Dockerized, multi-backend backup/sync web app powered
by **rclone** (the bundled binary is the **rclone-extra** fork → native TeraBox
etc.). pnpm monorepo:

- `packages/types` — shared TS contracts (keep dependency-free). Source of truth
  for the server↔web API shape.
- `packages/server` — Fastify API + the rclone engine. Key areas:
  `rclone/rclone.ts` (binary wrapper — **child_process**, arg arrays),
  `rclone/remotes.ts` (remote catalog + config.conf materialization),
  `backup/runner.ts` + `backup/scheduler.ts` (jobs), `http/server.ts` (routes,
  SSE, Range streaming, `reply.hijack()`), `crypto.ts` (AES-256-GCM credential
  encryption), `db/repo.ts` (better-sqlite3), `orchestrator.ts` (wiring).
- `packages/web` — React + Vite + Tailwind v4 + shadcn-style `ui/*`, TanStack
  Query (`lib/api.ts`, `hooks/queries.ts`), Zustand stores.
- `docker/` — multi-stage Dockerfile, gosu `entrypoint.sh` (PUID/PGID).

Read `docs/DESIGN.md` and `README.md`/`SETUP.md` for intended behavior, then
treat the code as the source of truth when they disagree.

## How to run the audit

Scale effort to the request. A quick "any bugs?" is a few finders; "thoroughly
audit / production-ready?" warrants the full fan-out below. Prefer the
**Workflow** tool (multi-agent) when the user opted into orchestration; otherwise
spawn `Agent` subagents (`Explore` for read-only sweeps) — one per dimension —
and synthesize. Don't audit serially in one context if you can fan out.

### Step 1 — Establish a baseline (always do this first)

Run and record the current state, so findings are real and not already-broken:

```
pnpm -r typecheck      # types + server + web
pnpm --filter @drivehub/server test
pnpm build
```

(Repo-local pnpm on Windows: `%LOCALAPPDATA%\npm-global\pnpm.cmd`.) Note any
existing warnings (e.g. the web >500 kB chunk warning is known/benign). A finding
that "X doesn't compile" is only valid if the baseline was green.

### Step 2 — Fan out across dimensions

Give each subagent ONE dimension, the repo orientation above, and this
instruction: *report only issues you can tie to specific `file:line`, with a
one-line fix and a severity (critical / high / medium / low / nit). Read the
code; do not speculate.* The dimensions (see `references/dimensions.md` for the
full checklist per dimension):

1. **Security** — the highest-value lens for this app. rclone arg construction
   (any string interpolation into a shell? it should always be an arg **array**,
   never `shell:true`), path traversal in `/api/fs` and `/api/fs/file` and the
   file endpoints, credential handling (encryption at rest, secrets never in
   logs/summaries/SSE), SSRF/`custom` remote abuse, Docker socket mount, PUID/PGID
   root behavior, missing authn (is the whole app unauthenticated by design?).
2. **Correctness / bugs** — race conditions in the scheduler/runner, SSE
   listener leaks (added but never removed on disconnect), `reply.hijack()`
   streams not destroyed on client abort, Range math, error paths that swallow
   failures, null/`undefined` mishandling, await-less promises.
3. **Performance** — rclone flags vs. settings (transfers/checkers/bwlimit),
   redundant `rclone size`/`about` calls, missing caches, N+1 queries, React
   re-renders / unmemoized lists, bundle size, query staleness/refetch storms.
4. **Dead code & weight** — unused exports/components/deps, vestigial features
   (e.g. removed-but-referenced endpoints), things that can be deleted to make
   the image/bundle lighter. This directly serves "make it lighter" requests.
5. **Robustness / UX** — failure surfaces (does a failed op show a clear
   message?), loading/empty/error states, accessibility of interactive controls,
   schema validation on all write routes (Zod), idempotency.
6. **Improvements / modernization** — new rclone-extra capabilities not yet
   exposed, newer/safer library APIs, features the architecture makes cheap
   (e.g. VFS media cache for streaming, job concurrency, notifications). Frame
   each as "today X → propose Y, because Z".

### Step 3 — Verify before reporting (don't skip)

False positives destroy trust. For every **critical/high** finding, verify it
adversarially: re-read the cited code (and its callers) and try to **refute** the
finding. If it can't be reproduced from the code, downgrade or drop it. When the
user opted into a Workflow, do this as a `Verify` stage; otherwise spawn a
skeptic subagent or re-check inline. Prefer running a quick script/grep to
confirm a claim over eyeballing it.

### Step 4 — Synthesize the report

Dedupe across dimensions, then produce this structure (ALWAYS this shape):

```
# DriveHub audit — <date>
## Summary            (1-3 sentences: overall health, biggest risks)
## Critical           (exploitable / data-loss / corruption)
## High               (real bugs, security weaknesses)
## Medium             (correctness edge cases, notable perf)
## Low / nits         (style, minor)
## Improvements       (features / modernization, not defects)
## Removed / lighten  (dead code & deps safe to delete)
```

Each finding: **what** (one line) · **where** (`file:line`) · **why it matters**
· **fix** (concrete). Order within each section by impact. End with a short
"recommended next actions" list the user can pick from — do NOT start changing
code unless the user asks; an audit reports first.

## Guardrails

- **Evidence or it didn't happen.** No finding without a `file:line` you read.
- **Respect intent.** This app is intentionally single-user/LAN and
  unauthenticated; flag that as a deployment note, not a bug, unless the user
  wants auth. TeraBox/iCloud limits are backend realities, not app bugs.
- **Don't break the green baseline.** If you fix anything afterwards, re-run
  Step 1 and keep it green; commit via a message file (here-strings break in
  PowerShell) and end commit messages with the repo's Co-Authored-By line.
- **Keep secrets out.** Never paste real credentials/keys into the report or
  commits; the repo is public.

See `references/dimensions.md` for the detailed per-dimension checklists and the
specific hotspots that have bitten this codebase before.
