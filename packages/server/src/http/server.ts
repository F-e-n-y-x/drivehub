import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppSettings, RemoteType } from "@drivehub/types";
import type { AppConfig } from "../config.js";
import { toJobPublic, toJobRun, toRemotePublic } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { Orchestrator } from "../orchestrator.js";
import { authUrl, exchangeCodeForRclone } from "../google/oauth.js";
import { getLogLevel, setLogLevel } from "../logger.js";
import { logStore } from "../logs/store.js";

const REMOTE_TYPES = ["local", "s3", "b2", "drive", "dropbox", "onedrive", "icloud", "webdav", "alist", "terabox", "teldrive", "alldebrid", "smb", "sftp", "custom"] as const;

const SettingsSchema = z.object({
  concurrency: z.number().int().min(1).max(32),
  excludePatterns: z.array(z.string()),
  bandwidthLimit: z.string(),
  speedTestSizeMb: z.number().int().min(1).max(1024),
  theme: z.enum(["light", "dark", "system"]),
});

const ScheduleSchema = z.object({
  kind: z.enum(["realtime", "interval", "daily", "weekly", "manual"]),
  intervalMinutes: z.number().int().min(1).optional(),
  timeOfDay: z.string().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
});

const JobInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["sync", "snapshot"]),
  sourceRemoteId: z.string().min(1),
  sourcePath: z.string().default(""),
  destRemoteId: z.string().min(1),
  destPath: z.string().default(""),
  mode: z.enum(["two_way", "mirror", "additive"]),
  schedule: ScheduleSchema,
  enabled: z.boolean(),
  snapshot: z.object({
    retentionKeep: z.number().int().min(1).max(3650),
    compressionLevel: z.number().int().min(0).max(9),
  }),
  quiesceContainers: z.array(z.string()),
});

const RemoteCreateSchema = z.object({
  type: z.enum(REMOTE_TYPES),
  label: z.string().min(1),
  params: z.record(z.string()),
});

const OAuthTokenSchema = z.object({
  type: z.enum(["drive", "dropbox", "onedrive"]),
  label: z.string().min(1),
  token: z.string().min(1),
});

const STATE_COOKIE = "dh_oauth_state";
const LABEL_COOKIE = "dh_oauth_label";

export function buildServer(config: AppConfig, orch: Orchestrator, logger: Logger) {
  // disableRequestLogging: per-request "incoming/completed" lines flood the
  // in-app log viewer (the UI polls several endpoints) and bury real events.
  const app = Fastify({ loggerInstance: logger, disableRequestLogging: true });
  const repo = orch.repo;
  void app.register(cookie);

  // ----- health / status -------------------------------------------------
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/status", async () => orch.getStatus());
  app.get("/api/system", async () => orch.systemInfo());

  app.post("/api/engine/pause", async () => {
    orch.pause();
    return { ok: true };
  });
  app.post("/api/engine/resume", async () => {
    orch.resume();
    return { ok: true };
  });

  // ----- settings --------------------------------------------------------
  app.get("/api/settings", async () => repo.getSettings());
  app.put("/api/settings", async (req, reply) => {
    const parsed = SettingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    repo.setSettings(parsed.data as AppSettings);
    orch.broadcastStatus();
    return repo.getSettings();
  });

  // ----- remotes ---------------------------------------------------------
  app.get("/api/remotes/catalog", async () => orch.remotes.catalog());
  app.get("/api/remotes", async () => orch.remotes.listPublic());

  app.post("/api/remotes", async (req, reply) => {
    const parsed = RemoteCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    try {
      const remote = await orch.remotes.create({
        type: parsed.data.type as RemoteType,
        label: parsed.data.label,
        params: parsed.data.params,
      });
      orch.onRemotesChanged();
      orch.bus.emit({ type: "remote", payload: remote });
      return remote;
    } catch (e) {
      return reply.code(400).send({ error: "remote_create_failed", message: String((e as Error).message ?? e) });
    }
  });

  // Create an OAuth remote by pasting a token from `rclone authorize`.
  app.post("/api/remotes/oauth-token", async (req, reply) => {
    const parsed = OAuthTokenSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    try {
      const remote = await orch.remotes.createOAuth({
        type: parsed.data.type as RemoteType,
        label: parsed.data.label,
        tokenJson: parsed.data.token,
      });
      orch.onRemotesChanged();
      return remote;
    } catch (e) {
      return reply.code(400).send({ error: "remote_create_failed", message: String((e as Error).message ?? e) });
    }
  });

  // iCloud needs an interactive 2FA step, so it has its own two-call flow.
  app.post("/api/remotes/icloud/start", async (req, reply) => {
    const b = (req.body ?? {}) as { label?: string; apple_id?: string; password?: string };
    if (!b.apple_id || !b.password) {
      return reply.code(400).send({ error: "bad_request", message: "apple_id and password required" });
    }
    try {
      const res = await orch.remotes.startIcloud({
        label: b.label || "iCloud Drive",
        appleId: b.apple_id,
        password: b.password,
      });
      if (res.status === "done") {
        orch.onRemotesChanged();
        orch.bus.emit({ type: "remote", payload: res.remote });
      }
      return res;
    } catch (e) {
      return reply.code(400).send({ error: "icloud_failed", message: String((e as Error).message ?? e) });
    }
  });

  app.post("/api/remotes/icloud/verify", async (req, reply) => {
    const b = (req.body ?? {}) as { sessionId?: string; code?: string };
    if (!b.sessionId || !b.code) {
      return reply.code(400).send({ error: "bad_request", message: "sessionId and code required" });
    }
    try {
      const res = await orch.remotes.verifyIcloud(b.sessionId, b.code);
      if (res.status === "done") {
        orch.onRemotesChanged();
        orch.bus.emit({ type: "remote", payload: res.remote });
      }
      return res;
    } catch (e) {
      return reply.code(400).send({ error: "icloud_failed", message: String((e as Error).message ?? e) });
    }
  });

  // Edit basic remote properties (currently just the display label).
  app.patch("/api/remotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { label?: string };
    const row = repo.getRemote(id);
    if (!row) return reply.code(404).send({ error: "not_found", message: "remote" });
    const label = (b.label ?? "").trim();
    if (!label) return reply.code(400).send({ error: "bad_request", message: "label required" });
    repo.updateRemote(id, { label });
    const updated = toRemotePublic(repo.getRemote(id)!);
    orch.bus.emit({ type: "remote", payload: updated });
    return updated;
  });

  app.post("/api/remotes/:id/test", async (req) => {
    const { id } = req.params as { id: string };
    return orch.remotes.test(id);
  });

  app.delete("/api/remotes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    // Refuse while a running job still uses this remote — deleting tears down
    // its rclone.conf section under the live transfer and fails confusingly.
    const busy = orch.repo
      .listJobs()
      .some((j) => (j.sourceRemoteId === id || j.destRemoteId === id) && orch.runner.isRunning(j.id));
    if (busy) {
      return reply.code(409).send({
        error: "remote_busy",
        message: "A running job is using this remote. Wait for it to finish (or disable it) before deleting.",
      });
    }
    await orch.remotes.delete(id);
    orch.onRemotesChanged();
    return { ok: true };
  });

  app.get("/api/remotes/:id/about", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await cachedAbout(id, () => orch.remotes.about(id));
    } catch (e) {
      return reply.code(400).send({ error: "about_failed", message: String((e as Error).message ?? e) });
    }
  });

  app.get("/api/remotes/:id/speedtest", async (req) => {
    const { id } = req.params as { id: string };
    return orch.remotes.lastSpeedTest(id);
  });

  app.post("/api/remotes/:id/speedtest", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await orch.remotes.speedTest(id);
    } catch (e) {
      return reply.code(400).send({ error: "speedtest_failed", message: String((e as Error).message ?? e) });
    }
  });

  app.get("/api/remotes/:id/browse", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { path?: string };
    try {
      return await orch.remotes.browse(id, q.path ?? "");
    } catch (e) {
      return reply.code(400).send({ error: "browse_failed", message: String((e as Error).message ?? e) });
    }
  });

  // ----- file operations (browser: mkdir/touch/delete/rename/copy/move) --
  const rcloneError = (r: { code: number; stderr: string }) =>
    r.stderr.split("\n").filter(Boolean).pop()?.slice(0, 300) ?? "operation failed";

  // target() throws on an unknown remote or a path that escapes a local
  // remote's base — turn that into a clean 400 instead of a generic 500.
  const badTarget = (reply: import("fastify").FastifyReply, e: unknown) =>
    reply.code(400).send({ error: "bad_target", message: String((e as Error).message ?? e) });

  app.post("/api/remotes/:id/ops/mkdir", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { path: p } = (req.body ?? {}) as { path?: string };
    let target: string;
    try { target = orch.remotes.target(id, p ?? ""); } catch (e) { return badTarget(reply, e); }
    const r = await orch.rclone.mkdir(target);
    return r.code === 0 ? { ok: true } : reply.code(400).send({ error: "mkdir_failed", message: rcloneError(r) });
  });

  app.post("/api/remotes/:id/ops/touch", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { path: p } = (req.body ?? {}) as { path?: string };
    let target: string;
    try { target = orch.remotes.target(id, p ?? ""); } catch (e) { return badTarget(reply, e); }
    const r = await orch.rclone.touch(target);
    return r.code === 0 ? { ok: true } : reply.code(400).send({ error: "touch_failed", message: rcloneError(r) });
  });

  app.post("/api/remotes/:id/ops/delete", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { path: p, isDir } = (req.body ?? {}) as { path?: string; isDir?: boolean };
    let target: string;
    try { target = orch.remotes.target(id, p ?? ""); } catch (e) { return badTarget(reply, e); }
    const r = isDir ? await orch.rclone.purge(target) : await orch.rclone.deleteFile(target);
    return r.code === 0 ? { ok: true } : reply.code(400).send({ error: "delete_failed", message: rcloneError(r) });
  });

  app.post("/api/remotes/:id/ops/rename", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { path: p, newName } = (req.body ?? {}) as { path?: string; newName?: string };
    if (!p || !newName) return reply.code(400).send({ error: "bad_request", message: "path and newName required" });
    const dst = path.posix.join(path.posix.dirname(p), newName);
    let srcT: string, dstT: string;
    try { srcT = orch.remotes.target(id, p); dstT = orch.remotes.target(id, dst); } catch (e) { return badTarget(reply, e); }
    const r = await orch.rclone.moveto(srcT, dstT);
    return r.code === 0 ? { ok: true } : reply.code(400).send({ error: "rename_failed", message: rcloneError(r) });
  });

  // Copy or move (cut/paste) between any two remotes/paths.
  app.post("/api/transfer-op", async (req, reply) => {
    const b = (req.body ?? {}) as {
      srcRemoteId?: string; srcPath?: string;
      dstRemoteId?: string; dstPath?: string; op?: "copy" | "move";
    };
    if (!b.srcRemoteId || !b.dstRemoteId || b.dstPath == null) {
      return reply.code(400).send({ error: "bad_request", message: "missing fields" });
    }
    let src: string, dst: string;
    try {
      src = orch.remotes.target(b.srcRemoteId, b.srcPath ?? "");
      dst = orch.remotes.target(b.dstRemoteId, b.dstPath);
    } catch (e) { return badTarget(reply, e); }
    const r = b.op === "move" ? await orch.rclone.moveto(src, dst) : await orch.rclone.copyto(src, dst);
    return r.code === 0 ? { ok: true } : reply.code(400).send({ error: "transfer_failed", message: rcloneError(r) });
  });

  // Stream a file's bytes (preview / download) with HTTP Range support so
  // <video>/<audio> can seek and large files stream progressively.
  app.get("/api/remotes/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { path?: string; download?: string };
    if (!q.path) return reply.code(400).send({ error: "bad_request", message: "path required" });
    const row = repo.getRemote(id);
    if (!row) return reply.code(404).send({ error: "not_found", message: "remote" });

    const target = orch.remotes.target(id, q.path);
    const filename = path.posix.basename(q.path);
    const rangeHeader = req.headers.range;

    // Cloud remotes stream through a cached `rclone serve http` (instant seeks,
    // read-ahead). Local needs no cache; TeraBox's backend downloads are broken
    // and serve can't fix them, so both keep the direct path. Any serve failure
    // falls back to `rclone cat` below.
    if (row.type !== "local" && row.type !== "terabox") {
      try {
        const upstream = await orch.media.urlFor(row.name, q.path);
        const resp = await fetch(upstream, {
          headers: rangeHeader ? { range: rangeHeader } : {},
        });
        if (!resp.body || (resp.status !== 200 && resp.status !== 206)) {
          throw new Error(`serve responded ${resp.status}`);
        }
        reply.hijack();
        const h = fileResponseHeaders(filename, q.download != null);
        const cr = resp.headers.get("content-range");
        const cl = resp.headers.get("content-length");
        if (cr) h["Content-Range"] = cr;
        if (cl) h["Content-Length"] = cl;
        reply.raw.writeHead(resp.status, h);
        const body = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0]);
        body.pipe(reply.raw);
        body.on("error", () => reply.raw.destroy());
        req.raw.on("close", () => body.destroy());
        return;
      } catch (e) {
        logger.debug({ err: String(e), id }, "vfs serve unavailable; using rclone cat");
        // fall through to the cat path (response not yet hijacked)
      }
    }

    const total = await cachedSize(`${id}:${q.path}`, () => orch.rclone.size(target));

    reply.hijack();
    const headers = fileResponseHeaders(filename, q.download != null);

    const pipe = (child: ReturnType<typeof orch.rclone.catProcess>) => {
      child.stdout.pipe(reply.raw);
      child.stderr.resume();
      child.on("error", () => reply.raw.destroy());
      req.raw.on("close", () => child.kill());
    };

    const m = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : total != null ? total - 1 : -1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (total != null && (Number.isNaN(end) || end >= total)) end = total - 1;

    // Only do a PARTIAL (206) read for a genuine sub-range — and only when the
    // size is known. A full-file request (the common case, e.g. "bytes=0-") is
    // streamed plainly with 200: `rclone cat --offset/--count` is unreliable on
    // some backends (e.g. TeraBox) and a mismatched 206 makes players give up.
    const isPartial = m != null && total != null && (start > 0 || end < total - 1);
    if (isPartial) {
      if (start > end) {
        reply.raw.writeHead(416, { "Content-Range": `bytes */${total}` });
        reply.raw.end();
        return;
      }
      const len = end - start + 1;
      reply.raw.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(len),
      });
      pipe(orch.rclone.catProcess(target, { offset: start, count: len }));
    } else {
      if (total != null) headers["Content-Length"] = String(total);
      reply.raw.writeHead(200, headers);
      pipe(orch.rclone.catProcess(target));
    }
  });

  // ----- local filesystem browser (container FS: /, /app, /data/sync …) -----
  app.get("/api/fs", async (req, reply) => {
    const q = req.query as { path?: string };
    try {
      return await browseLocalFs(q.path);
    } catch (e) {
      return reply.code(400).send({ error: "fs_browse_failed", message: String((e as Error).message ?? e) });
    }
  });

  // Stream a local file (preview/download) with Range support, read straight
  // from disk — used by the built-in "Local files" browser source.
  app.get("/api/fs/file", async (req, reply) => {
    const q = req.query as { path?: string; download?: string };
    if (!q.path) return reply.code(400).send({ error: "bad_request", message: "path required" });
    const abs = path.resolve(q.path);
    let size: number;
    try {
      const st = await stat(abs);
      if (!st.isFile()) return reply.code(400).send({ error: "not_a_file", message: abs });
      size = st.size;
    } catch {
      return reply.code(404).send({ error: "not_found", message: abs });
    }
    const filename = path.basename(abs);
    reply.hijack();
    const headers = fileResponseHeaders(filename, q.download != null);
    const m = req.headers.range ? /bytes=(\d*)-(\d*)/.exec(req.headers.range) : null;
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end) {
        reply.raw.writeHead(416, { "Content-Range": `bytes */${size}` });
        reply.raw.end();
        return;
      }
      reply.raw.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      });
      const s = createReadStream(abs, { start, end });
      s.pipe(reply.raw);
      s.on("error", () => reply.raw.destroy());
      req.raw.on("close", () => s.destroy());
    } else {
      reply.raw.writeHead(200, { ...headers, "Content-Length": String(size) });
      const s = createReadStream(abs);
      s.pipe(reply.raw);
      s.on("error", () => reply.raw.destroy());
      req.raw.on("close", () => s.destroy());
    }
  });

  // ----- jobs ------------------------------------------------------------
  app.get("/api/jobs", async () => repo.listJobs().map(toJobPublic));

  app.post("/api/jobs", async (req, reply) => {
    const parsed = JobInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    const row = repo.insertJob(parsed.data);
    orch.onJobsChanged();
    const job = toJobPublic(row);
    orch.bus.emit({ type: "job", payload: job });
    return job;
  });

  app.put("/api/jobs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = JobInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    if (!repo.getJob(id)) return reply.code(404).send({ error: "not_found", message: "job" });
    repo.updateJobConfig(id, parsed.data);
    orch.onJobsChanged();
    return toJobPublic(repo.getJob(id)!);
  });

  app.delete("/api/jobs/:id", async (req) => {
    const { id } = req.params as { id: string };
    repo.deleteJob(id);
    orch.onJobsChanged();
    return { ok: true };
  });

  app.post("/api/jobs/:id/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!repo.getJob(id)) return reply.code(404).send({ error: "not_found", message: "job" });
    void orch.runJob(id); // fire and forget; progress streams over SSE
    return { ok: true };
  });

  app.get("/api/jobs/:id/runs", async (req) => {
    const { id } = req.params as { id: string };
    return repo.listRuns(id, 50).map(toJobRun);
  });

  // ----- updates ---------------------------------------------------------
  app.get("/api/updates", async () => orch.updates.check());
  app.post("/api/updates/check", async () => {
    const status = await orch.updates.check(true);
    orch.bus.emit({ type: "updates", payload: status });
    return status;
  });
  app.post("/api/updates/rclone", async (_req, reply) => {
    const result = await orch.updates.updateRclone();
    const status = await orch.updates.check(true);
    orch.bus.emit({ type: "updates", payload: status });
    orch.broadcastStatus();
    if (!result.ok) return reply.code(500).send({ error: "update_failed", message: result.message });
    return { ok: true, message: result.message, updates: status };
  });

  // ----- runs & activity -------------------------------------------------
  app.get("/api/runs", async () => repo.recentRuns(50).map(toJobRun));
  app.get("/api/activity", async (req) => {
    const q = req.query as { limit?: string; search?: string };
    const limit = Math.min(Number(q.limit ?? 100) || 100, 500);
    return repo.recentActivity(limit, q.search);
  });

  // ----- logs (Developer panel) ------------------------------------------
  const LogLevelSchema = z.object({
    level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]),
  });

  app.get("/api/logs", async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 500) || 500, 2000);
    return logStore.recent(limit);
  });

  app.get("/api/logs/level", async () => ({ level: getLogLevel() }));
  app.put("/api/logs/level", async (req, reply) => {
    const parsed = LogLevelSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    setLogLevel(parsed.data.level);
    logger.info({ level: parsed.data.level }, "log level changed");
    return { level: getLogLevel() };
  });

  app.get("/api/logs/download", async (_req, reply) => {
    void reply.header("Content-Type", "text/plain; charset=utf-8");
    void reply.header("Content-Disposition", `attachment; filename="drivehub-logs.txt"`);
    return logStore.asText();
  });

  app.get("/api/logs/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`: connected\n\n`);
    const unsubscribe = logStore.subscribe((entry) => {
      reply.raw.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 25000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ----- Google Drive OAuth bridge --------------------------------------
  app.get("/api/oauth/google/start", async (req, reply) => {
    if (!config.googleConfigured) {
      return reply.redirect("/?error=google_not_configured");
    }
    const q = req.query as { label?: string };
    const state = nanoid(24);
    reply.setCookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    reply.setCookie(LABEL_COOKIE, q.label ?? "Google Drive", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    return reply.redirect(authUrl(config, state));
  });

  app.get("/api/oauth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) return reply.redirect(`/remotes?error=${encodeURIComponent(q.error)}`);
    if (!q.code || !q.state || q.state !== req.cookies[STATE_COOKIE]) {
      return reply.redirect("/remotes?error=invalid_state");
    }
    try {
      const conn = await exchangeCodeForRclone(config, q.code);
      const label = req.cookies[LABEL_COOKIE] || conn.email || "Google Drive";
      const remote = await orch.remotes.createOAuth({
        type: "drive",
        label,
        tokenJson: conn.rcloneTokenJson,
        knownEmail: conn.email,
        extra: {
          client_id: config.GOOGLE_CLIENT_ID ?? "",
          client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
          scope: "drive",
        },
      });
      orch.onRemotesChanged();
      // Announce the new remote so any open tab updates its connect status live.
      orch.bus.emit({ type: "remote", payload: remote });
      return reply.redirect(`/remotes?connected=${encodeURIComponent(conn.email)}`);
    } catch (err) {
      logger.error({ err: String(err) }, "google oauth callback failed");
      return reply.redirect("/remotes?error=oauth_failed");
    }
  });

  // ----- SSE -------------------------------------------------------------
  app.get("/api/events", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`: connected\n\n`);
    reply.raw.write(`data: ${JSON.stringify({ type: "status", payload: orch.getStatus() })}\n\n`);

    const unsubscribe = orch.bus.subscribe((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 25000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  // ----- static SPA ------------------------------------------------------
  const webDist = resolveWebDist();
  if (webDist) {
    void app.register(fastifyStatic, { root: webDist, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not_found", message: req.url });
      }
      return reply.sendFile("index.html");
    });
  } else {
    logger.warn("web build not found; serving API only");
    app.get("/", async () => ({ ok: true, message: "DriveHub API is running." }));
  }

  return app;
}

// Cache file sizes briefly so a video's many Range requests don't each shell
// out to `rclone size`.
const sizeCache = new Map<string, { size: number | null; at: number }>();
async function cachedSize(key: string, fetcher: () => Promise<number | null>): Promise<number | null> {
  const hit = sizeCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.size;
  const size = await fetcher();
  sizeCache.set(key, { size, at: Date.now() });
  return size;
}

// Cache storage usage for 60s so the Remotes page doesn't spawn one (or two)
// rclone processes per card on every mount.
const aboutCache = new Map<string, { value: unknown; at: number }>();
async function cachedAbout<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = aboutCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value as T;
  const value = await fetcher();
  aboutCache.set(key, { value, at: Date.now() });
  return value;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  avif: "image/avif", heic: "image/heic",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4",
  pdf: "application/pdf",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", log: "text/plain",
  json: "application/json", xml: "application/xml", yaml: "text/plain", yml: "text/plain",
  html: "text/html", css: "text/css", js: "text/javascript", ts: "text/plain",
};

function mimeFromName(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return MIME[ext] ?? "application/octet-stream";
}

// Only these media render safely inline. Anything else (html, svg, xml, js…)
// could execute script in our origin if opened as a top-level document, so we
// force it to download and never let the browser MIME-sniff it.
function fileResponseHeaders(filename: string, download: boolean): Record<string, string> {
  const mime = mimeFromName(filename);
  const inlineOk = /^(image\/(?!svg)|video\/|audio\/|application\/pdf$|text\/plain$)/.test(mime);
  const safeName = filename.replace(/[\r\n"]/g, "");
  return {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download || !inlineOk ? "attachment" : "inline"}; filename="${safeName}"`,
  };
}

async function browseLocalFs(input?: string): Promise<import("@drivehub/types").FsListing> {
  const target = input && input.length ? path.resolve(input) : "/";
  const dirents = await readdir(target, { withFileTypes: true });
  const entries = await Promise.all(
    dirents
      .filter((d) => !d.name.startsWith(".") || d.isDirectory())
      .map(async (d) => {
        const full = path.join(target, d.name);
        let sizeBytes: number | null = null;
        if (!d.isDirectory()) {
          // Real sizes drive the UI and the text-preview cap (a null size would
          // let a multi-GB file slip past the limit and OOM the browser tab).
          try {
            sizeBytes = (await stat(full)).size;
          } catch {
            /* unreadable entry — leave size unknown */
          }
        }
        return { name: d.name, path: full, isDir: d.isDirectory(), sizeBytes };
      }),
  );
  entries
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .splice(2000);
  const parent = target === path.parse(target).root ? null : path.dirname(target);
  return { path: target, parent, entries };
}

function resolveWebDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.WEB_DIST,
    path.resolve(here, "../../web/dist"),
    path.resolve(here, "../../../web/dist"),
    "/app/web",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}
