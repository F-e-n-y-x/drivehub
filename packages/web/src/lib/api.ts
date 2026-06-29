import type {
  ActivityEvent,
  AppSettings,
  EngineStatus,
  JobInput,
  JobPublic,
  JobRun,
  OkResponse,
  RemoteListing,
  RemotePublic,
  RemoteType,
  RemoteTypeInfo,
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
};

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
  activity: (search: string) => ["activity", search] as const,
};
