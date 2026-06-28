import type {
  AccountPublic,
  ActivityEvent,
  AppSettings,
  ConflictRecord,
  DriveListing,
  EngineStatus,
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

type Ok = { ok: true };

export const api = {
  health: () => request<{ ok: true }>("/api/health"),
  status: () => request<EngineStatus>("/api/status"),

  accounts: () => request<AccountPublic[]>("/api/accounts"),
  deleteAccount: (id: string) =>
    request<Ok>(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  pauseAccount: (id: string) =>
    request<Ok>(`/api/accounts/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  resumeAccount: (id: string) =>
    request<Ok>(`/api/accounts/${encodeURIComponent(id)}/resume`, { method: "POST" }),

  drive: (accountId: string, folderId: string) =>
    request<DriveListing>(
      `/api/accounts/${encodeURIComponent(accountId)}/drive?folderId=${encodeURIComponent(folderId)}`,
    ),

  activity: (opts?: { limit?: number; search?: string }) => {
    const params = new URLSearchParams();
    params.set("limit", String(opts?.limit ?? 100));
    if (opts?.search) params.set("search", opts.search);
    return request<ActivityEvent[]>(`/api/activity?${params.toString()}`);
  },

  conflicts: () => request<ConflictRecord[]>("/api/conflicts"),
  resolveConflict: (id: string) =>
    request<Ok>(`/api/conflicts/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
    }),

  settings: () => request<AppSettings>("/api/settings"),
  updateSettings: (body: AppSettings) =>
    request<AppSettings>("/api/settings", { method: "PUT", json: body }),

  pauseEngine: () => request<Ok>("/api/engine/pause", { method: "POST" }),
  resumeEngine: () => request<Ok>("/api/engine/resume", { method: "POST" }),
};

/** Centralized query keys so SSE handlers and components stay in sync. */
export const qk = {
  status: ["status"] as const,
  accounts: ["accounts"] as const,
  drive: (accountId: string, folderId: string) =>
    ["drive", accountId, folderId] as const,
  activity: (search: string) => ["activity", search] as const,
  conflicts: ["conflicts"] as const,
  settings: ["settings"] as const,
};
