import { mkdir, rm, statfs, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  RemoteListing,
  RemotePublic,
  RemoteType,
  RemoteTypeInfo,
} from "@drivehub/types";
import type { AppConfig } from "../config.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import { Repo, toRemotePublic } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { TeraBoxClient } from "../terabox/client.js";
import type { RcloneService } from "./rclone.js";

/**
 * UI catalog: which fields each backend needs. The web app renders forms from
 * this, so adding a backend is just adding an entry here + a mapping below.
 */
export const REMOTE_CATALOG: RemoteTypeInfo[] = [
  {
    type: "local",
    label: "Local / NAS / USB",
    oauth: false,
    description: "A folder on this host, a mounted NAS share, or a USB disk.",
    fields: [
      { key: "path", label: "Folder path", type: "text", required: true, placeholder: "/data/sync", help: "Absolute path inside the container (a mounted volume)." },
    ],
  },
  {
    type: "s3",
    label: "S3-compatible (AWS, MinIO, Wasabi)",
    oauth: false,
    description: "Any S3-compatible object storage.",
    fields: [
      { key: "provider", label: "Provider", type: "text", required: false, placeholder: "AWS | Minio | Wasabi | Other" },
      { key: "access_key_id", label: "Access Key ID", type: "text", required: true },
      { key: "secret_access_key", label: "Secret Access Key", type: "password", required: true },
      { key: "region", label: "Region", type: "text", required: false, placeholder: "us-east-1" },
      { key: "endpoint", label: "Endpoint", type: "text", required: false, placeholder: "https://s3.example.com (for MinIO/Wasabi)" },
    ],
  },
  {
    type: "b2",
    label: "Backblaze B2",
    oauth: false,
    description: "Backblaze B2 cloud storage.",
    fields: [
      { key: "account", label: "Account / Key ID", type: "text", required: true },
      { key: "key", label: "Application Key", type: "password", required: true },
    ],
  },
  {
    type: "webdav",
    label: "WebDAV / Nextcloud",
    oauth: false,
    description: "WebDAV servers including Nextcloud and ownCloud.",
    fields: [
      { key: "url", label: "URL", type: "text", required: true, placeholder: "https://cloud.example.com/remote.php/dav/files/user" },
      { key: "vendor", label: "Vendor", type: "text", required: false, placeholder: "nextcloud | owncloud | other" },
      { key: "user", label: "Username", type: "text", required: true },
      { key: "pass", label: "Password", type: "password", required: true },
    ],
  },
  {
    type: "alist",
    label: "AList / OpenList",
    oauth: false,
    description:
      "Connect an AList or OpenList server over WebDAV — and through it, any storage AList supports (TeraBox, Quark, Baidu, 115, and more) without managing tokens here.",
    fields: [
      { key: "url", label: "WebDAV URL", type: "text", required: true, placeholder: "http://host:5244/dav" },
      { key: "user", label: "Username", type: "text", required: true },
      { key: "pass", label: "Password", type: "password", required: true },
    ],
  },
  {
    type: "terabox",
    label: "TeraBox",
    oauth: false,
    description:
      "Connect TeraBox with your account cookie. Browse, upload, download and stream (downloads use TeraBox's unofficial web API, so they can break if TeraBox changes their site or the cookie expires).",
    fields: [
      {
        key: "cookie",
        label: "Cookie",
        type: "password",
        required: true,
        help: "Sign in at terabox.com, open DevTools (F12) → Network → click any request → copy the full Cookie header (must include ndus=…).",
      },
    ],
  },
  {
    type: "teldrive",
    label: "Teldrive (Telegram)",
    oauth: false,
    description:
      "Telegram-backed storage via your own Teldrive server (bundled rclone-extra backend). Point at the Teldrive instance and paste its session token.",
    fields: [
      { key: "api_host", label: "API host", type: "text", required: true, placeholder: "https://teldrive.example.com" },
      {
        key: "access_token",
        label: "Access token (session)",
        type: "password",
        required: true,
        help: "In your Teldrive web UI: DevTools (F12) → Application → Cookies → copy the user_session value.",
      },
    ],
  },
  {
    type: "alldebrid",
    label: "AllDebrid",
    oauth: false,
    description:
      "Browse your AllDebrid media folder over AllDebrid's WebDAV. Create an API key in your AllDebrid account.",
    fields: [
      {
        key: "api_key",
        label: "API key",
        type: "password",
        required: true,
        help: "Create one at alldebrid.com → Apikeys panel, then paste it here.",
      },
    ],
  },
  {
    type: "smb",
    label: "SMB / CIFS (NAS, Windows share)",
    oauth: false,
    description: "Connect directly to a NAS or Windows file share over SMB.",
    fields: [
      { key: "host", label: "Host", type: "text", required: true, placeholder: "192.168.1.10" },
      { key: "user", label: "Username", type: "text", required: false, placeholder: "guest" },
      { key: "pass", label: "Password", type: "password", required: false },
      { key: "domain", label: "Domain / Workgroup", type: "text", required: false, placeholder: "WORKGROUP" },
      { key: "port", label: "Port", type: "number", required: false, placeholder: "445" },
    ],
  },
  {
    type: "custom",
    label: "Custom / other (advanced)",
    oauth: false,
    description:
      "Configure any rclone backend not listed above — pCloud, Mega, Koofr, Storj, Box, Yandex, and (with a TeraBox-capable rclone build set via RCLONE_BIN) TeraBox. Enter the rclone backend name and its config keys.",
    fields: [],
  },
  {
    type: "sftp",
    label: "SFTP / SSH",
    oauth: false,
    description: "Any server reachable over SSH/SFTP.",
    fields: [
      { key: "host", label: "Host", type: "text", required: true, placeholder: "192.168.1.10" },
      { key: "port", label: "Port", type: "number", required: false, placeholder: "22" },
      { key: "user", label: "Username", type: "text", required: true },
      { key: "pass", label: "Password", type: "password", required: false, help: "Leave blank if using a key file." },
      { key: "key_file", label: "Private key file", type: "text", required: false, placeholder: "/data/app/keys/id_ed25519" },
    ],
  },
  {
    type: "drive",
    label: "Google Drive",
    oauth: true,
    description: "Connect a Google account (one-click sign-in).",
    fields: [],
  },
  {
    type: "dropbox",
    label: "Dropbox",
    oauth: true,
    description: "Connect a Dropbox account.",
    fields: [],
  },
  {
    type: "onedrive",
    label: "OneDrive",
    oauth: true,
    description: "Connect a Microsoft OneDrive account.",
    fields: [],
  },
  {
    type: "icloud",
    label: "iCloud Drive (experimental)",
    oauth: false,
    description:
      "Experimental. iCloud requires your primary Apple ID password AND an interactive 2FA code, which this quick form can't complete — so it will likely fail. Use the two-step connect (coming soon) or a more reliable backend (S3/B2). Advanced Data Protection accounts are not supported.",
    fields: [
      { key: "apple_id", label: "Apple ID", type: "text", required: true, placeholder: "you@icloud.com" },
      { key: "password", label: "Apple ID password", type: "password", required: true, help: "Your primary Apple ID password (NOT an app-specific password — those are rejected by iCloud Drive). A 2FA code is also required, which this form cannot submit yet." },
    ],
  },
];

/** Map a DriveHub remote type to the underlying rclone backend type. */
const RCLONE_BACKEND: Partial<Record<RemoteType, string>> = {
  icloud: "iclouddrive",
  alist: "webdav", // AList/OpenList is reached via its WebDAV endpoint
  terabox: "terabox", // native backend (bundled rclone-extra fork)
  teldrive: "teldrive", // native backend (bundled rclone-extra fork)
  alldebrid: "webdav", // AllDebrid exposes a WebDAV media folder
};
function rcloneBackend(type: RemoteType): string {
  return RCLONE_BACKEND[type] ?? type;
}

const SECRET_KEYS = new Set([
  "secret_access_key",
  "key",
  "pass",
  "token",
  "client_secret",
  "cookie",
  "access_token",
  "api_key",
]);

/** Looks secret by name (covers arbitrary keys from custom backends). */
function looksSecret(key: string): boolean {
  return /pass|secret|token|key|credential|auth/i.test(key);
}

/** Build the non-secret summary shown in the UI. */
function buildSummary(type: RemoteType, params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith("__")) continue;
    if (SECRET_KEYS.has(k) || looksSecret(k)) continue;
    if (!v) continue;
    out[k] = v;
  }
  return out;
}

function sanitizeName(label: string, existing: Set<string>): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "remote";
  let name = base;
  let n = 1;
  while (existing.has(name)) name = `${base}_${n++}`;
  return name;
}

export class RemoteService {
  /** Set by the orchestrator — used to download TeraBox (rclone can't). */
  private terabox: TeraBoxClient | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repo,
    private readonly rclone: RcloneService,
    private readonly logger: Logger,
  ) {}

  setTeraboxClient(client: TeraBoxClient): void {
    this.terabox = client;
  }

  catalog(): RemoteTypeInfo[] {
    return REMOTE_CATALOG;
  }

  listPublic(): RemotePublic[] {
    return this.repo.listRemotes().map(toRemotePublic);
  }

  /**
   * Ensure every DB remote exists in rclone.conf. We SKIP remotes already
   * present (rclone.conf lives on the mounted volume and persists), because
   * re-running `config create` for some backends (notably iCloud) re-triggers
   * an interactive sign-in/2FA and fails non-interactively (-20101).
   */
  async rebuildConfig(): Promise<void> {
    const existing = await this.rclone.configDump();
    for (const row of this.repo.listRemotes()) {
      if (row.type === "local") continue; // local needs no rclone remote
      if (existing[row.name]) continue; // already configured — don't re-auth
      try {
        const params = this.decryptParams(row.configEnc);
        if (row.type === "custom") {
          const { __backend, ...rest } = params;
          if (__backend) await this.rclone.configCreate(row.name, __backend, rest);
        } else {
          await this.rclone.configCreate(row.name, rcloneBackend(row.type as RemoteType), params);
        }
      } catch (e) {
        this.logger.error({ err: String(e), remote: row.name }, "failed to rebuild rclone remote");
      }
    }
  }

  private decryptParams(configEnc: string): Record<string, string> {
    return JSON.parse(decryptSecret(configEnc, this.config.TOKEN_ENCRYPTION_KEY));
  }

  /** A single decrypted config value for a remote (e.g. a TeraBox cookie). */
  getParam(remoteId: string, key: string): string | null {
    const row = this.repo.getRemote(remoteId);
    if (!row) return null;
    try {
      return this.decryptParams(row.configEnc)[key] ?? null;
    } catch {
      return null;
    }
  }

  /** Create a key/password remote (non-OAuth) from validated form params. */
  async create(input: {
    type: RemoteType;
    label: string;
    params: Record<string, string>;
  }): Promise<RemotePublic> {
    const existing = new Set(this.repo.listRemotes().map((r) => r.name));
    const name = sanitizeName(input.label, existing);
    const params = pruneEmpty(input.params);

    // AList speaks generic WebDAV; rclone needs the vendor hint.
    if (input.type === "alist" && !params.vendor) params.vendor = "other";

    // AllDebrid is just WebDAV under the hood: API key = username, password is
    // ignored. Translate the single "API key" field into a WebDAV config.
    if (input.type === "alldebrid") {
      params.url = "https://webdav.debrid.it/";
      params.vendor = "other";
      params.user = params.api_key ?? "";
      params.pass = params.api_key ?? "x"; // AllDebrid ignores the password
      delete params.api_key;
    }

    let summary: Record<string, string>;
    if (input.type === "custom") {
      const backend = params.__backend;
      if (!backend) throw new Error("Custom remote requires an rclone backend type.");
      const { __backend, ...rest } = params;
      await this.rclone.configCreate(name, backend, rest);
      summary = { backend, ...buildSummary("custom", rest) };
    } else {
      if (input.type !== "local") {
        await this.rclone.configCreate(name, rcloneBackend(input.type), params);
      }
      summary = buildSummary(input.type, params);
    }
    const row = this.repo.insertRemote({
      name,
      type: input.type,
      label: input.label,
      configEnc: encryptSecret(JSON.stringify(params), this.config.TOKEN_ENCRYPTION_KEY),
      summary,
      status: "ok",
    });
    return toRemotePublic(row);
  }

  /** Create an OAuth remote from an rclone token JSON (and extra params). */
  async createOAuth(input: {
    type: RemoteType;
    label: string;
    tokenJson: string;
    extra?: Record<string, string>;
    /** Email already known from the OAuth flow (preferred over a lookup). */
    knownEmail?: string | null;
  }): Promise<RemotePublic> {
    const params: Record<string, string> = { token: input.tokenJson, ...(input.extra ?? {}) };
    const remote = await this.create({ type: input.type, label: input.label, params });
    // Prefer the email from the OAuth flow; fall back to an rclone lookup.
    const email = input.knownEmail ?? (await this.fetchAccountEmail(remote.name));
    if (email) {
      const row = this.repo.getRemote(remote.id);
      if (row) {
        const summary = { ...safeJson(row.summary), email };
        this.repo.updateRemote(remote.id, { summary: JSON.stringify(summary) });
        return toRemotePublic(this.repo.getRemote(remote.id)!);
      }
    }
    return remote;
  }

  // ----- iCloud (interactive 2FA) ----------------------------------------
  private icloudPending = new Map<string, { name: string; label: string; appleId: string; state: string }>();

  /** Step 1: submit Apple ID + password; returns a 2FA prompt or completes. */
  async startIcloud(input: { label: string; appleId: string; password: string }): Promise<
    { status: "need_2fa"; sessionId: string; prompt: string } | { status: "done"; remote: RemotePublic }
  > {
    const existing = new Set(this.repo.listRemotes().map((r) => r.name));
    const name = sanitizeName(input.label || "icloud", existing);
    const q = await this.rclone.configCreateInteractive(name, "iclouddrive", {
      apple_id: input.appleId,
      password: input.password,
    });
    if (q.error && !q.optionName) {
      await this.rclone.configDelete(name).catch(() => {});
      throw new Error(q.error);
    }
    if (q.done) {
      const remote = await this.finalizeIcloud(name, input.label, input.appleId);
      return { status: "done", remote };
    }
    const sessionId = `ic_${nanoid(10)}`;
    this.icloudPending.set(sessionId, { name, label: input.label, appleId: input.appleId, state: q.state });
    return {
      status: "need_2fa",
      sessionId,
      prompt: q.help || "Enter the 6-digit verification code sent to your Apple devices.",
    };
  }

  /** Step 2: submit the 2FA code. */
  async verifyIcloud(sessionId: string, code: string): Promise<
    { status: "need_2fa"; sessionId: string; prompt: string } | { status: "done"; remote: RemotePublic }
  > {
    const session = this.icloudPending.get(sessionId);
    if (!session) throw new Error("Session expired — start the iCloud connection again.");
    const q = await this.rclone.configContinue(session.name, session.state, code);
    if (q.error && !q.optionName) {
      throw new Error(q.error);
    }
    if (q.done) {
      this.icloudPending.delete(sessionId);
      const remote = await this.finalizeIcloud(session.name, session.label, session.appleId);
      return { status: "done", remote };
    }
    session.state = q.state;
    return { status: "need_2fa", sessionId, prompt: q.help || "Enter the verification code." };
  }

  private async finalizeIcloud(name: string, label: string, appleId: string): Promise<RemotePublic> {
    const dump = await this.rclone.configDump();
    const params = dump[name] ?? {};
    const row = this.repo.insertRemote({
      name,
      type: "icloud",
      label,
      configEnc: encryptSecret(JSON.stringify(params), this.config.TOKEN_ENCRYPTION_KEY),
      summary: { email: appleId },
      status: "ok",
    });
    return toRemotePublic(row);
  }

  private async fetchAccountEmail(remoteName: string): Promise<string | null> {
    try {
      const info = await this.rclone.userInfo(remoteName);
      return (
        info.email ??
        info.Email ??
        info.emailAddress ??
        info.login ??
        info.user ??
        info.owner ??
        null
      );
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const row = this.repo.getRemote(id);
    if (!row) return;
    if (row.type !== "local") await this.rclone.configDelete(row.name);
    this.repo.deleteRemote(id);
  }

  async test(id: string): Promise<{ ok: boolean; error?: string }> {
    const row = this.repo.getRemote(id);
    if (!row) return { ok: false, error: "not found" };
    let result: { ok: boolean; error?: string };
    if (row.type === "local") {
      const p = this.localPath(row.configEnc);
      result = await this.rclone
        .lsjson(p)
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: String(e) }));
    } else {
      result = await this.rclone.testRemote(row.name);
    }
    this.repo.setRemoteStatus(id, result.ok ? "ok" : "error");
    return result;
  }

  /** Build the rclone target ("remote:path" or a local filesystem path). */
  target(remoteId: string, subPath: string): string {
    const row = this.repo.getRemote(remoteId);
    if (!row) throw new Error(`Unknown remote: ${remoteId}`);
    const clean = (subPath ?? "").replace(/^\/+/, "");
    if (row.type === "local") {
      const base = path.posix.normalize(this.localPath(row.configEnc));
      if (!clean) return base;
      // Confine to the remote's base — `..` segments must not escape it, or a
      // browse/delete/move op could read or destroy arbitrary container files.
      const joined = path.posix.normalize(path.posix.join(base, clean));
      const prefix = base.endsWith("/") ? base : base + "/";
      if (joined !== base && !joined.startsWith(prefix)) {
        throw new Error("Path escapes the remote's base directory");
      }
      return joined;
    }
    return `${row.name}:${clean}`;
  }

  private localPath(configEnc: string): string {
    const params = this.decryptParams(configEnc);
    return params.path ?? "/data/sync";
  }

  /** Storage usage for a remote (local uses statfs; others use rclone about). */
  async about(remoteId: string): Promise<{ total: number | null; used: number | null; free: number | null }> {
    const row = this.repo.getRemote(remoteId);
    if (!row) throw new Error("Unknown remote");
    // Works for both clouds ("name:") and local (a filesystem path).
    const a = await this.rclone.aboutTarget(this.target(remoteId, ""));
    if (a.total != null) return { total: a.total, used: a.used, free: a.free };
    // Fallback for local disks where rclone About may not report.
    if (row.type === "local") {
      try {
        const s = await statfs(this.localPath(row.configEnc));
        const total = Number(s.blocks) * s.bsize;
        const free = Number(s.bavail) * s.bsize;
        return { total, free, used: total - free };
      } catch {
        /* fall through */
      }
    }
    return { total: a.total, used: a.used, free: a.free };
  }

  /** Last saved speed-test result for a remote, or null. */
  lastSpeedTest(remoteId: string): {
    sizeBytes: number;
    uploadBytesPerSec: number | null;
    downloadBytesPerSec: number | null;
    at: number | null;
  } | null {
    const raw = this.repo.kvGet(`speedtest:${remoteId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * On-demand round-trip speed test: upload then download a temp blob. Uses the
   * same throughput flags as real jobs (bigger chunks + multi-thread download)
   * so the number reflects tuned performance, not a throttled single stream.
   */
  async speedTest(
    remoteId: string,
    sizeBytesOverride?: number,
  ): Promise<{ sizeBytes: number; uploadBytesPerSec: number | null; downloadBytesPerSec: number | null; at: number }> {
    const row = this.repo.getRemote(remoteId);
    if (!row) throw new Error("Unknown remote");
    const mb = this.repo.getSettings().speedTestSizeMb || 32;
    const sizeBytes = sizeBytesOverride ?? mb * 1024 * 1024;
    const tmpDir = path.join(this.config.DATA_DIR, "tmp");
    await mkdir(tmpDir, { recursive: true });
    const upPath = path.join(tmpDir, `speedtest-up-${nanoid(6)}.bin`);
    const downPath = path.join(tmpDir, `speedtest-down-${nanoid(6)}.bin`);
    const testName = `.drivehub-speedtest-${nanoid(6)}.bin`;
    const remoteTarget = this.target(remoteId, testName);

    const perfArgs = [
      "--drive-chunk-size", "64M",
      "--drive-pacer-min-sleep", "10ms",
      "--multi-thread-streams", "8",
      "--multi-thread-cutoff", "16M",
    ];
    let uploadBytesPerSec: number | null = null;
    let downloadBytesPerSec: number | null = null;
    try {
      await writeFile(upPath, randomBytes(sizeBytes));
      const t1 = Date.now();
      const up = await this.rclone.copyto(upPath, remoteTarget, perfArgs);
      const upMs = Date.now() - t1;
      if (up.code !== 0) {
        if (/method not allowed|405|read.?only|not allowed|forbidden|403/i.test(up.stderr)) {
          throw new Error("This remote doesn't allow uploads, so a speed test isn't available for it.");
        }
        throw new Error(up.stderr.split("\n").filter(Boolean).pop() ?? "upload failed");
      }
      uploadBytesPerSec = upMs > 0 ? Math.round(sizeBytes / (upMs / 1000)) : null;

      if (row.type === "terabox" && this.terabox) {
        // rclone can't download TeraBox — measure via the direct API instead.
        // The just-uploaded file may take a moment to be indexed, so retry.
        const cookie = this.getParam(remoteId, "cookie");
        if (cookie) {
          for (let i = 0; i < 4 && downloadBytesPerSec === null; i++) {
            try {
              const t2 = Date.now();
              const { url, headers } = await this.terabox.resolveDownload(cookie, testName);
              const res = await fetch(url, { headers });
              const bytes = (await res.arrayBuffer()).byteLength;
              const downMs = Date.now() - t2;
              if (res.ok && bytes > 0) {
                downloadBytesPerSec = downMs > 0 ? Math.round(bytes / (downMs / 1000)) : null;
              }
            } catch (e) {
              this.logger.debug({ err: String(e), attempt: i }, "terabox speedtest download retry");
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      } else {
        const t2 = Date.now();
        const down = await this.rclone.copyto(remoteTarget, downPath, perfArgs);
        const downMs = Date.now() - t2;
        if (down.code === 0) {
          downloadBytesPerSec = downMs > 0 ? Math.round(sizeBytes / (downMs / 1000)) : null;
        }
      }
    } finally {
      await this.rclone.deleteFile(remoteTarget).catch(() => {});
      await rm(upPath, { force: true }).catch(() => {});
      await rm(downPath, { force: true }).catch(() => {});
    }
    const result = { sizeBytes, uploadBytesPerSec, downloadBytesPerSec, at: Date.now() };
    // Persist so the last result survives navigation/restart.
    this.repo.kvSet(`speedtest:${remoteId}`, JSON.stringify(result));
    return result;
  }

  async browse(remoteId: string, subPath: string): Promise<RemoteListing> {
    const target = this.target(remoteId, subPath);
    const raw = await this.rclone.lsjson(target);
    const entries = raw
      .map((e) => ({
        name: e.Name,
        path: subPath ? `${subPath.replace(/\/+$/, "")}/${e.Name}` : e.Name,
        isDir: e.IsDir,
        sizeBytes: e.Size ?? 0,
        modTime: e.ModTime ?? null,
        mimeType: e.MimeType ?? null,
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const breadcrumbs: Array<{ name: string; path: string }> = [{ name: "/", path: "" }];
    const parts = subPath.split("/").filter(Boolean);
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      breadcrumbs.push({ name: part, path: acc });
    }
    return { remoteId, path: subPath, breadcrumbs, entries };
  }
}

function safeJson(s: string): Record<string, string> {
  try {
    return JSON.parse(s) as Record<string, string>;
  } catch {
    return {};
  }
}

function pruneEmpty(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}`.length > 0) out[k] = `${v}`;
  }
  return out;
}
