import type { Logger } from "../logger.js";

interface AlistResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * Minimal client for the built-in AList admin API. Lets DriveHub add storages
 * (TeraBox, Quark, Baidu, 115…) on the user's behalf, so they never have to
 * touch the AList UI — they configure it from DriveHub and we do the plumbing.
 */
export class AlistApi {
  private token: string | null = null;

  constructor(
    private readonly base: string,
    private readonly password: string,
    private readonly logger: Logger,
  ) {}

  private async login(): Promise<void> {
    const res = await fetch(`${this.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: this.password }),
    });
    const json = (await res.json()) as AlistResponse<{ token: string }>;
    if (json.code !== 200 || !json.data?.token) {
      throw new Error(`AList login failed: ${json.message || res.status}`);
    }
    this.token = json.data.token;
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    if (!this.token) await this.login();
    const call = async () =>
      fetch(`${this.base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: this.token ?? "",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await call();
    let json = (await res.json()) as AlistResponse<T>;
    if (json.code === 401) {
      // token expired — re-login once
      this.token = null;
      await this.login();
      res = await call();
      json = (await res.json()) as AlistResponse<T>;
    }
    if (json.code !== 200) throw new Error(json.message || `AList ${path} failed`);
    return json.data;
  }

  /** List configured storages (mount_path -> driver). */
  async listStorages(): Promise<Array<{ id: number; mount_path: string; driver: string }>> {
    const data = await this.request<{ content: Array<{ id: number; mount_path: string; driver: string }> }>(
      "/api/admin/storage/list",
      "GET",
    );
    return data.content ?? [];
  }

  /** Create a storage. `addition` is the driver-specific config object. */
  async createStorage(input: {
    mountPath: string;
    driver: string;
    addition: Record<string, unknown>;
  }): Promise<{ id: number }> {
    return this.request<{ id: number }>("/api/admin/storage/create", "POST", {
      mount_path: input.mountPath,
      driver: input.driver,
      addition: JSON.stringify(input.addition),
      order: 0,
      remark: "Added by DriveHub",
      cache_expiration: 30,
      web_proxy: false,
      webdav_policy: "native_proxy",
      down_proxy_url: "",
      status: "work",
      order_by: "name",
      order_direction: "asc",
    });
  }
}
