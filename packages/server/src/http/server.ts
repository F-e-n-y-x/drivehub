import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type {
  AppSettings,
  DriveListing,
  DriveNode,
  RemoteState,
} from "@drivehub/types";
import type { AppConfig } from "../config.js";
import { encryptSecret } from "../crypto.js";
import { toAccountPublic } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { SyncEngine } from "../engine/engine.js";
import { authUrl, exchangeCode } from "../google/oauth.js";

const SettingsSchema = z.object({
  pollIntervalMs: z.number().int().min(2000).max(600000),
  concurrency: z.number().int().min(1).max(32),
  deletePropagation: z.boolean(),
  ignorePatterns: z.array(z.string()),
  theme: z.enum(["light", "dark", "system"]),
});

const STATE_COOKIE = "dh_oauth_state";

export function buildServer(config: AppConfig, engine: SyncEngine, logger: Logger) {
  const app = Fastify({ loggerInstance: logger });
  const repo = engine.repo;

  void app.register(cookie);

  // ----- health ----------------------------------------------------------
  app.get("/api/health", async () => ({ ok: true }));

  // ----- status / stats --------------------------------------------------
  app.get("/api/status", async () => engine.getStatus());
  app.get("/api/accounts", async () =>
    repo.listAccounts().map(toAccountPublic),
  );

  // ----- engine controls -------------------------------------------------
  app.post("/api/engine/pause", async () => {
    engine.pause();
    return { ok: true };
  });
  app.post("/api/engine/resume", async () => {
    engine.resume();
    return { ok: true };
  });

  // ----- settings --------------------------------------------------------
  app.get("/api/settings", async () => repo.getSettings());
  app.put("/api/settings", async (req, reply) => {
    const parsed = SettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", message: parsed.error.message });
    }
    engine.applySettings(parsed.data as AppSettings);
    return repo.getSettings();
  });

  // ----- activity & conflicts -------------------------------------------
  app.get("/api/activity", async (req) => {
    const q = req.query as { limit?: string; search?: string };
    const limit = Math.min(Number(q.limit ?? 100) || 100, 500);
    return repo.recentActivity(limit, q.search);
  });
  app.get("/api/conflicts", async () => repo.listConflicts(false));
  app.post("/api/conflicts/:id/resolve", async (req) => {
    const { id } = req.params as { id: string };
    repo.resolveConflict(id);
    return { ok: true };
  });

  // ----- OAuth -----------------------------------------------------------
  app.get("/api/auth/google/start", async (_req, reply) => {
    const state = nanoid(24);
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return reply.redirect(authUrl(config, state));
  });

  app.get("/api/auth/google/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    if (q.error) return reply.redirect(`/?error=${encodeURIComponent(q.error)}`);
    const cookieState = req.cookies[STATE_COOKIE];
    if (!q.code || !q.state || q.state !== cookieState) {
      return reply.redirect("/?error=invalid_state");
    }
    try {
      const identity = await exchangeCode(config, q.code);
      const enc = encryptSecret(identity.refreshToken, config.TOKEN_ENCRYPTION_KEY);
      const existing = repo.getAccountByEmail(identity.email);
      if (existing) {
        repo.updateAccount(existing.id, {
          refreshTokenEnc: enc,
          name: identity.name,
          picture: identity.picture,
          status: "active",
        });
      } else {
        repo.insertAccount({
          email: identity.email,
          name: identity.name,
          picture: identity.picture,
          refreshTokenEnc: enc,
          rootFolderId: "root",
          rootFolderName: "My Drive",
          startPageToken: null,
          status: "active",
          quotaUsed: null,
          quotaTotal: null,
          lastDeltaAt: null,
          createdAt: Date.now(),
        });
      }
      // Fetch quota/identity best-effort.
      const account = repo.getAccountByEmail(identity.email)!;
      try {
        const about = await engine.registry.client(account.id).about();
        repo.updateAccount(account.id, {
          quotaUsed: about.quotaUsed,
          quotaTotal: about.quotaTotal,
          picture: about.picture ?? identity.picture,
        });
      } catch (e) {
        logger.warn({ err: String(e) }, "about() failed after connect");
      }
      await engine.onAccountsChanged();
      return reply.redirect(`/?connected=${encodeURIComponent(identity.email)}`);
    } catch (err) {
      logger.error({ err: String(err) }, "oauth callback failed");
      return reply.redirect("/?error=oauth_failed");
    }
  });

  // ----- accounts mgmt ---------------------------------------------------
  app.delete("/api/accounts/:id", async (req) => {
    const { id } = req.params as { id: string };
    repo.deleteAccount(id);
    await engine.onAccountsChanged();
    return { ok: true };
  });
  app.post("/api/accounts/:id/pause", async (req) => {
    const { id } = req.params as { id: string };
    repo.updateAccount(id, { status: "paused" });
    await engine.onAccountsChanged();
    return { ok: true };
  });
  app.post("/api/accounts/:id/resume", async (req) => {
    const { id } = req.params as { id: string };
    repo.updateAccount(id, { status: "active" });
    await engine.onAccountsChanged();
    return { ok: true };
  });

  // ----- Drive viewer ----------------------------------------------------
  app.get("/api/accounts/:id/drive", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { folderId?: string };
    const account = repo.getAccount(id);
    if (!account) return reply.code(404).send({ error: "not_found", message: "account" });

    const client = engine.registry.client(id);
    const folderId =
      !q.folderId || q.folderId === "root"
        ? await client.resolveRootId(account.rootFolderId)
        : q.folderId;

    const children = await client.listChildren(folderId);
    const nodes: DriveNode[] = children
      .map((f) => {
        const remote = repo.findRemoteByDriveId(id, f.id);
        return {
          id: f.id,
          name: f.name,
          type: f.isFolder ? ("folder" as const) : ("file" as const),
          mimeType: f.mimeType,
          sizeBytes: f.size,
          modifiedTime: f.modifiedTime,
          syncState: (remote?.state as RemoteState) ?? ("unknown" as const),
          iconLink: f.iconLink,
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // Build breadcrumbs by walking parents up to the account root.
    const rootId = await client.resolveRootId(account.rootFolderId);
    const breadcrumbs: Array<{ id: string; name: string }> = [
      { id: "root", name: account.rootFolderName ?? "My Drive" },
    ];
    if (folderId !== rootId) {
      const chain: Array<{ id: string; name: string }> = [];
      let cur = await client.getFile(folderId);
      let guard = 0;
      while (cur && guard++ < 50) {
        chain.unshift({ id: cur.id, name: cur.name });
        const parent = cur.parents[0];
        if (!parent || parent === rootId || parent === "root") break;
        cur = await client.getFile(parent);
      }
      breadcrumbs.push(...chain);
    }

    const listing: DriveListing = {
      accountId: id,
      folderId,
      breadcrumbs,
      nodes,
    };
    return listing;
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
    // Push an initial status snapshot.
    reply.raw.write(`data: ${JSON.stringify({ type: "status", payload: engine.getStatus() })}\n\n`);

    const unsubscribe = engine.bus.subscribe((event) => {
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
    app.get("/", async () => ({
      ok: true,
      message: "DriveHub API is running. Build the web UI to serve the dashboard.",
    }));
  }

  return app;
}

function resolveWebDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.WEB_DIST,
    path.resolve(here, "../../web/dist"), // dev: packages/server/dist -> packages/web/dist
    path.resolve(here, "../../../web/dist"),
    "/app/web", // docker image layout
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}
