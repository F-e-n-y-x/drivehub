import path from "node:path";
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
];

const SECRET_KEYS = new Set([
  "secret_access_key",
  "key",
  "pass",
  "token",
  "client_secret",
]);

/** Build the non-secret summary shown in the UI. */
function buildSummary(type: RemoteType, params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (SECRET_KEYS.has(k)) continue;
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
  constructor(
    private readonly config: AppConfig,
    private readonly repo: Repo,
    private readonly rclone: RcloneService,
    private readonly logger: Logger,
  ) {}

  catalog(): RemoteTypeInfo[] {
    return REMOTE_CATALOG;
  }

  listPublic(): RemotePublic[] {
    return this.repo.listRemotes().map(toRemotePublic);
  }

  /** Re-materialize rclone.conf from the DB (DB is the source of truth). */
  async rebuildConfig(): Promise<void> {
    for (const row of this.repo.listRemotes()) {
      if (row.type === "local") continue; // local needs no rclone remote
      try {
        const params = this.decryptParams(row.configEnc);
        await this.rclone.configCreate(row.name, row.type, params);
      } catch (e) {
        this.logger.error({ err: String(e), remote: row.name }, "failed to rebuild rclone remote");
      }
    }
  }

  private decryptParams(configEnc: string): Record<string, string> {
    return JSON.parse(decryptSecret(configEnc, this.config.TOKEN_ENCRYPTION_KEY));
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

    if (input.type !== "local") {
      await this.rclone.configCreate(name, input.type, params);
    }
    const row = this.repo.insertRemote({
      name,
      type: input.type,
      label: input.label,
      configEnc: encryptSecret(JSON.stringify(params), this.config.TOKEN_ENCRYPTION_KEY),
      summary: buildSummary(input.type, params),
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
  }): Promise<RemotePublic> {
    const params: Record<string, string> = { token: input.tokenJson, ...(input.extra ?? {}) };
    return this.create({ type: input.type, label: input.label, params });
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
      const base = this.localPath(row.configEnc);
      return clean ? path.posix.join(base, clean) : base;
    }
    return `${row.name}:${clean}`;
  }

  private localPath(configEnc: string): string {
    const params = this.decryptParams(configEnc);
    return params.path ?? "/data/sync";
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

function pruneEmpty(params: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}`.length > 0) out[k] = `${v}`;
  }
  return out;
}
