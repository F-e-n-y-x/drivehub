import type { Logger } from "../logger.js";

/**
 * TeraBox download resolver. The bundled rclone-extra `terabox` backend can
 * list/upload but its downloads fail, so for streaming/downloading we talk to
 * TeraBox's unofficial web API directly — a faithful port of the OpenList/AList
 * `terabox` driver. Two methods:
 *   - official (primary): /api/home/info → an RC4+base64 `sign` → /api/download
 *     → a dlink that 302s to the CDN.
 *   - dlna (fallback): /api/filemetas?...&dlink=1&origin=dlna → info[0].dlink.
 * Domain is per-account: API calls on the wrong host return errno -6 with the
 * right host in a `Url-Domain-Prefix` response HEADER (e.g. "dm"). jsToken is
 * scraped from the homepage and refreshed on errno 4000023/450016. Unofficial
 * and cookie-bound, so callers must fall back gracefully.
 */

const UA = "terabox;1.37.0.7;PC;PC-Windows;10.0.22631;WindowsTeraBox";
const DEFAULT_BASE = "https://www.terabox.com";
const COMMON = { app_id: "250528", web: "1", channel: "dubox", clienttype: "0" };
const SESSION_TTL = 5 * 60_000;

interface Session {
  jsToken: string;
  base: string;
  at: number;
}

export class TeraBoxClient {
  private sessions = new Map<string, Session>();

  constructor(private readonly logger: Logger) {}

  /** Resolve a directly-downloadable URL (+ headers) for a file path. */
  async resolveDownload(
    rawCookie: string,
    filePath: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const cookie = sanitizeCookie(rawCookie);
    const target = filePath.startsWith("/") ? filePath : `/${filePath}`;

    // One filemetas call gives us both the fs_id (for the official method) and
    // a ready dlna dlink (the fallback).
    const meta = await this.apiCall(cookie, "/api/filemetas", {
      target: JSON.stringify([target]),
      dlink: "1",
      origin: "dlna",
    });
    const info = (meta.body.info as Array<{ fs_id?: number | string; dlink?: string }> | undefined)?.[0];
    if (!info) throw new Error(`terabox filemetas returned no info (errno=${meta.body.errno})`);

    // Primary: official sign-based download (re-resolved fresh, CDN token is
    // short-lived). Fall back to the dlna dlink if anything in it fails.
    if (info.fs_id != null) {
      try {
        const url = await this.officialDownload(cookie, String(info.fs_id));
        if (url) return { url, headers: { "User-Agent": UA, Cookie: cookie } };
      } catch (e) {
        this.logger.debug({ err: String(e) }, "terabox official download failed; trying dlna");
      }
    }
    if (info.dlink) return { url: info.dlink, headers: { "User-Agent": UA, Cookie: cookie } };
    throw new Error("terabox: could not resolve a download link");
  }

  /** Official flow: home/info → sign → /api/download → resolve the 302 Location. */
  private async officialDownload(cookie: string, fsId: string): Promise<string | null> {
    const home = await this.apiCall(cookie, "/api/home/info", {});
    const data = home.body.data as { sign1?: string; sign3?: string } | undefined;
    if (!data?.sign1 || !data?.sign3) return null;
    const sign = rc4Base64(data.sign3, data.sign1);

    const dl = await this.apiCall(cookie, "/api/download", {
      type: "dlink",
      fidlist: `[${fsId}]`,
      sign,
      vip: "2",
      timestamp: String(Math.floor(Date.now() / 1000)),
    });
    const dlink = (dl.body.dlink as Array<{ dlink?: string }> | undefined)?.[0]?.dlink;
    if (!dlink) return null;

    // The dlink 302s to the real CDN URL; read Location without following.
    const res = await tfetch(dlink, {
      headers: { Cookie: cookie, "User-Agent": UA },
      redirect: "manual",
    });
    return res.headers.get("location") ?? dlink;
  }

  /**
   * Authenticated GET against the account's API, handling the two retryable
   * errnos: -6 (wrong domain → switch host from header) and jsToken expiry.
   */
  private async apiCall(
    cookie: string,
    apiPath: string,
    params: Record<string, string>,
    body?: string,
    depth = 0,
  ): Promise<{ body: Record<string, unknown> }> {
    const s = await this.session(cookie);
    const url = new URL(`${s.base}${apiPath}`);
    for (const [k, v] of Object.entries({ ...COMMON, jsToken: s.jsToken, ...params })) {
      url.searchParams.set(k, v);
    }
    const init: RequestInit = { headers: this.headers(cookie, s.base) };
    if (body != null) {
      init.method = "POST";
      init.body = body;
      init.headers = { ...this.headers(cookie, s.base), "Content-Type": "application/x-www-form-urlencoded" };
    }
    const res = await tfetch(url, init);
    const prefix = res.headers.get("url-domain-prefix");
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const errno = json.errno as number | undefined;

    if (depth < 2 && errno === -6 && prefix) {
      // jsToken is host-specific — switch domain and refresh on the new host.
      this.sessions.delete(cookie);
      this.sessions.set(cookie, { ...s, base: `https://${prefix}.terabox.com`, at: 0 });
      return this.apiCall(cookie, apiPath, params, body, depth + 1);
    }
    if (depth < 2 && (errno === 4000023 || errno === 450016)) {
      this.sessions.delete(cookie);
      return this.apiCall(cookie, apiPath, params, body, depth + 1);
    }
    if (errno === 9000) throw new Error("terabox: not available in this region for this account");
    return { body: json };
  }

  /** File-manager op (move/copy/rename/delete). Throws on a non-zero errno. */
  async manage(
    rawCookie: string,
    opera: "move" | "copy" | "rename" | "delete",
    filelist: unknown[],
  ): Promise<void> {
    const cookie = sanitizeCookie(rawCookie);
    const body = `async=0&filelist=${encodeURIComponent(JSON.stringify(filelist))}&ondup=newcopy`;
    const res = await this.apiCall(cookie, "/api/filemanager", { onnest: "fail", opera }, body);
    const errno = res.body.errno as number | undefined;
    if (errno !== 0) throw new Error(`terabox ${opera} failed (errno=${errno})`);
  }

  /** Create a directory. */
  async mkdir(rawCookie: string, dirPath: string): Promise<void> {
    const cookie = sanitizeCookie(rawCookie);
    const p = dirPath.startsWith("/") ? dirPath : `/${dirPath}`;
    const body = `path=${encodeURIComponent(p)}&isdir=1&block_list=%5B%5D`;
    const res = await this.apiCall(cookie, "/api/create", { a: "commit" }, body);
    const errno = res.body.errno as number | undefined;
    if (errno !== 0) throw new Error(`terabox mkdir failed (errno=${errno})`);
  }

  private async session(cookie: string): Promise<Session> {
    const hit = this.sessions.get(cookie);
    if (hit && Date.now() - hit.at < SESSION_TTL) return hit;

    // jsToken from the default host, then discover the account's real domain
    // by probing the API once (errno -6 → Url-Domain-Prefix header).
    let base = DEFAULT_BASE;
    let jsToken = await this.fetchJsToken(cookie, base);
    const probe = new URL(`${base}/api/list`);
    for (const [k, v] of Object.entries({ ...COMMON, jsToken, dir: "/", num: "1", page: "1" })) {
      probe.searchParams.set(k, v);
    }
    const res = await tfetch(probe, { headers: this.headers(cookie, base) });
    const prefix = res.headers.get("url-domain-prefix");
    const body = (await res.json().catch(() => ({}))) as { errno?: number };
    if (body.errno === -6 && prefix) {
      base = `https://${prefix}.terabox.com`;
      jsToken = await this.fetchJsToken(cookie, base);
      this.logger.debug({ base }, "terabox account domain resolved");
    }
    const session: Session = { jsToken, base, at: Date.now() };
    this.sessions.set(cookie, session);
    return session;
  }

  private async fetchJsToken(cookie: string, base: string): Promise<string> {
    const res = await tfetch(`${base}/main`, { headers: this.headers(cookie, base) });
    const html = await res.text();
    const m = /fn%28%22([0-9A-Fa-f]+)%22%29/.exec(html);
    if (!m || !m[1]) throw new Error("terabox: jsToken not found (cookie expired?)");
    return m[1];
  }

  private headers(cookie: string, base: string): Record<string, string> {
    return {
      Cookie: cookie,
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      Referer: `${base}/`,
      "X-Requested-With": "XMLHttpRequest",
    };
  }
}

/** fetch with a hard timeout so a stalled TeraBox call can't hang a request. */
function tfetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
}

/**
 * Drop cookie pairs whose value would be an invalid/odd HTTP header value
 * (notably `g_state={…}` with braces/quotes) — keep the rest. `ndus` is the
 * load-bearing session field.
 */
function sanitizeCookie(cookie: string): string {
  return cookie
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !/[{}"\\\r\n]/.test(p))
    .join("; ");
}

/** RC4 keystream of `data` keyed by `key`, base64-encoded (TeraBox's sign). */
function rc4Base64(key: string, data: string): string {
  const a = new Int32Array(256);
  const p = new Int32Array(256);
  const v = key.length;
  for (let q = 0; q < 256; q++) {
    a[q] = key.charCodeAt(q % v);
    p[q] = q;
  }
  for (let u = 0, q = 0; q < 256; q++) {
    u = (u + p[q]! + a[q]!) % 256;
    const t = p[q]!;
    p[q] = p[u]!;
    p[u] = t;
  }
  const out = Buffer.alloc(data.length);
  for (let i = 0, u = 0, q = 0; q < data.length; q++) {
    i = (i + 1) % 256;
    u = (u + p[i]!) % 256;
    const t = p[i]!;
    p[i] = p[u]!;
    p[u] = t;
    const k = p[(p[i]! + p[u]!) % 256]!;
    out[q] = data.charCodeAt(q) ^ k;
  }
  return out.toString("base64");
}
