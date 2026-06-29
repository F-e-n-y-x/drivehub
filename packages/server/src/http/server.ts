import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { AppSettings, RemoteType } from "@drivehub/types";
import type { AppConfig } from "../config.js";
import { toJobPublic, toJobRun } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { Orchestrator } from "../orchestrator.js";
import { authUrl, exchangeCodeForRclone } from "../google/oauth.js";

const REMOTE_TYPES = ["local", "s3", "b2", "drive", "dropbox", "onedrive", "webdav", "sftp"] as const;

const SettingsSchema = z.object({
  concurrency: z.number().int().min(1).max(32),
  excludePatterns: z.array(z.string()),
  bandwidthLimit: z.string(),
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
  const app = Fastify({ loggerInstance: logger });
  const repo = orch.repo;
  void app.register(cookie);

  // ----- health / status -------------------------------------------------
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/status", async () => orch.getStatus());

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

  app.post("/api/remotes/:id/test", async (req) => {
    const { id } = req.params as { id: string };
    return orch.remotes.test(id);
  });

  app.delete("/api/remotes/:id", async (req) => {
    const { id } = req.params as { id: string };
    await orch.remotes.delete(id);
    orch.onRemotesChanged();
    return { ok: true };
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
      await orch.remotes.createOAuth({
        type: "drive",
        label,
        tokenJson: conn.rcloneTokenJson,
        extra: {
          client_id: config.GOOGLE_CLIENT_ID ?? "",
          client_secret: config.GOOGLE_CLIENT_SECRET ?? "",
          scope: "drive",
        },
      });
      orch.onRemotesChanged();
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
