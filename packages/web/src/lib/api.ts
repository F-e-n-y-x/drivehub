import type {
  ActivityEvent,
  AppSettings,
  EngineStatus,
  FsListing,
  JobInput,
  JobPublic,
  JobRun,
  LogEntry,
  LogLevel,
  OkResponse,
  RemoteListing,
  RemotePublic,
  RemoteType,
  RemoteTypeInfo,
  SystemInfo,
  UpdateStatus,
} from "@drivehub/types";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body?.message) message = body.message;
      if (body?.error) code = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface CreateRemoteInput {
  type: RemoteType;
  label: string;
  params: Record<string, string>;
}

export interface OAuthTokenInput {
  type: "drive" | "dropbox" | "onedrive";
  label: string;
  token: string;
}

export interface TransferOpInput {
  srcRemoteId: string;
  srcPath: string;
  dstRemoteId: string;
  dstPath: string;
  op: "copy" | "move";
}

export interface IcloudStartInput {
  label: string;
  apple_id: string;
  password: string;
}

/**
 * Result of an iCloud connect step. `done` carries the finished remote; the
 * server can ask for a 2FA code one or more times via `need_2fa`.
 */
export type IcloudStepResult =
  | { status: "done"; remote: RemotePublic }
  | { status: "need_2fa"; sessionId: string; prompt: string };

/**
 * Builds the URL that streams a remote file's bytes. Use directly as an
 * `<img>/<video>/<audio>/<iframe>` src or download href, or fetch it for text
 * preview. `download` sets a Content-Disposition: attachment on the response.
 */
export function fileUrl(id: string, path: string, download?: boolean): string {
  const params = new URLSearchParams({ path });
  if (download) params.set("download", "1");
  return `/api/remotes/${encodeURIComponent(id)}/file?${params.toString()}`;
}

export const api = {
  health: () => request<OkResponse>("/api/health"),
  status: () => request<EngineStatus>("/api/status"),

  settings: () => request<AppSettings>("/api/settings"),
  updateSettings: (body: AppSettings) =>
    request<AppSettings>("/api/settings", { method: "PUT", json: body }),

  pauseEngine: () => request<OkResponse>("/api/engine/pause", { method: "POST" }),
  resumeEngine: () =>
    request<OkResponse>("/api/engine/resume", { method: "POST" }),

  // Remotes
  remoteCatalog: () => request<RemoteTypeInfo[]>("/api/remotes/catalog"),
  remotes: () => request<RemotePublic[]>("/api/remotes"),
  createRemote: (body: CreateRemoteInput) =>
    request<RemotePublic>("/api/remotes", { method: "POST", json: body }),
  createOAuthRemote: (body: OAuthTokenInput) =>
    request<RemotePublic>("/api/remotes/oauth-token", {
      method: "POST",
      json: body,
    }),
  // iCloud's interactive 2FA flow: start, then verify one or more codes.
  startIcloud: (body: IcloudStartInput) =>
    request<IcloudStepResult>("/api/remotes/icloud/start", {
      method: "POST",
      json: body,
    }),
  verifyIcloud: (body: { sessionId: string; code: string }) =>
    request<IcloudStepResult>("/api/remotes/icloud/verify", {
      method: "POST",
      json: body,
    }),
  testRemote: (id: string) =>
    request<{ ok: boolean; error?: string }>(
      `/api/remotes/${encodeURIComponent(id)}/test`,
      { method: "POST" },
    ),
  deleteRemote: (id: string) =>
    request<OkResponse>(`/api/remotes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  browse: (id: string, path: string) =>
    request<RemoteListing>(
      `/api/remotes/${encodeURIComponent(id)}/browse?path=${encodeURIComponent(path)}`,
    ),

  // Remote file-manager ops
  mkdir: (id: string, path: string) =>
    request<OkResponse>(`/api/remotes/${encodeURIComponent(id)}/ops/mkdir`, {
      method: "POST",
      json: { path },
    }),
  touch: (id: string, path: string) =>
    request<OkResponse>(`/api/remotes/${encodeURIComponent(id)}/ops/touch`, {
      method: "POST",
      json: { path },
    }),
  deleteEntry: (id: string, path: string, isDir: boolean) =>
    request<OkResponse>(`/api/remotes/${encodeURIComponent(id)}/ops/delete`, {
      method: "POST",
      json: { path, isDir },
    }),
  rename: (id: string, path: string, newName: string) =>
    request<OkResponse>(`/api/remotes/${encodeURIComponent(id)}/ops/rename`, {
      method: "POST",
      json: { path, newName },
    }),
  transferOp: (payload: TransferOpInput) =>
    request<OkResponse>("/api/transfer-op", { method: "POST", json: payload }),

  // Local filesystem browser (for the Local remote directory picker)
  browseFs: (path?: string) =>
    request<FsListing>(
      `/api/fs${path ? `?path=${encodeURIComponent(path)}` : ""}`,
    ),

  // Jobs
  jobs: () => request<JobPublic[]>("/api/jobs"),
  createJob: (body: JobInput) =>
    request<JobPublic>("/api/jobs", { method: "POST", json: body }),
  updateJob: (id: string, body: JobInput) =>
    request<JobPublic>(`/api/jobs/${encodeURIComponent(id)}`, {
      method: "PUT",
      json: body,
    }),
  deleteJob: (id: string) =>
    request<OkResponse>(`/api/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  runJob: (id: string) =>
    request<OkResponse>(`/api/jobs/${encodeURIComponent(id)}/run`, {
      method: "POST",
    }),
  jobRuns: (id: string) =>
    request<JobRun[]>(`/api/jobs/${encodeURIComponent(id)}/runs`),

  // Runs & activity
  runs: () => request<JobRun[]>("/api/runs"),
  activity: (opts?: { limit?: number; search?: string }) => {
    const params = new URLSearchParams();
    params.set("limit", String(opts?.limit ?? 100));
    if (opts?.search) params.set("search", opts.search);
    return request<ActivityEvent[]>(`/api/activity?${params.toString()}`);
  },

  // Updates
  getUpdates: () => request<UpdateStatus>("/api/updates"),
  checkUpdates: () =>
    request<UpdateStatus>("/api/updates/check", { method: "POST" }),
  updateRclone: () =>
    request<{ ok: boolean; message: string; updates: UpdateStatus }>(
      "/api/updates/rclone",
      { method: "POST" },
    ),

  // System info (About / diagnostics)
  getSystem: () => request<SystemInfo>("/api/system"),

  // Logs (in-app developer viewer)
  getLogs: (limit?: number) =>
    request<LogEntry[]>(
      `/api/logs${limit ? `?limit=${encodeURIComponent(String(limit))}` : ""}`,
    ),
  getLogLevel: () => request<{ level: LogLevel }>("/api/logs/level"),
  setLogLevel: (level: LogLevel) =>
    request<{ level: LogLevel }>("/api/logs/level", {
      method: "PUT",
      json: { level },
    }),
};

/** Direct download URL for the full log file (use as an <a download> href). */
export function logsDownloadUrl(): string {
  return "/api/logs/download";
}

/** Centralized query keys so SSE handlers and components stay in sync. */
export const qk = {
  status: ["status"] as const,
  settings: ["settings"] as const,
  catalog: ["remote-catalog"] as const,
  remotes: ["remotes"] as const,
  jobs: ["jobs"] as const,
  runs: ["runs"] as const,
  jobRuns: (jobId: string) => ["job-runs", jobId] as const,
  browse: (remoteId: string, path: string) =>
    ["browse", remoteId, path] as const,
  fs: (path: string) => ["fs", path] as const,
  activity: (search: string) => ["activity", search] as const,
  updates: ["updates"] as const,
  system: ["system"] as const,
  logs: ["logs"] as const,
  logLevel: ["log-level"] as const,
};
