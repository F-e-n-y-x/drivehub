import type { Logger } from "../logger.js";

/**
 * Minimal TeraBox download resolver. The bundled rclone-extra `terabox` backend
 * can list/upload but its downloads fail, so for streaming/downloading we hit
 * TeraBox's unofficial web API directly (the same flow OpenList/AList use):
 *   1. scrape a `jsToken` from the homepage,
 *   2. discover the account's real domain — API calls on the wrong host return
 *      errno -6 with a `Url-Domain-Prefix` response HEADER (e.g. "dm" →
 *      https://dm.terabox.com),
 *   3. call `/api/filemetas?...&dlink=1&origin=dlna` for a file path → a `dlink`.
 * The dlink is a CDN URL that supports HTTP Range, so video seeking works. This
 * is unofficial and may break if TeraBox changes their site; callers should
 * fall back gracefully.
 */

// TeraBox checks for its desktop-client UA on these endpoints.
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
  // jsToken + resolved domain, cached per cookie.
  private sessions = new Map<string, Session>();

  constructor(private readonly logger: Logger) {}

  /** Resolve a directly-downloadable URL (+ headers) for a file path. */
  async resolveDownload(
    cookie: string,
    filePath: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const target = filePath.startsWith("/") ? filePath : `/${filePath}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await this.session(cookie, attempt > 0);
      const url = new URL(`${s.base}/api/filemetas`);
      for (const [k, v] of Object.entries(COMMON)) url.searchParams.set(k, v);
      url.searchParams.set("jsToken", s.jsToken);
      url.searchParams.set("target", JSON.stringify([target]));
      url.searchParams.set("dlink", "1");
      url.searchParams.set("origin", "dlna");

      const res = await fetch(url, { headers: this.headers(cookie, s.base) });
      const body = (await res.json().catch(() => ({}))) as {
        errno?: number;
        info?: Array<{ dlink?: string }>;
      };
      const dlink = body.info?.[0]?.dlink;
      if (body.errno === 0 && dlink) {
        return {
          url: dlink,
          headers: { "User-Agent": UA, Cookie: cookie, Referer: `${s.base}/` },
        };
      }
      // -6 (wrong domain) or a stale jsToken — drop the session and retry once.
      this.sessions.delete(cookie);
      this.logger.debug({ errno: body.errno, base: s.base }, "terabox filemetas miss; re-resolving");
    }
    throw new Error("terabox: could not resolve download link");
  }

  private async session(cookie: string, force = false): Promise<Session> {
    const hit = this.sessions.get(cookie);
    if (!force && hit && Date.now() - hit.at < SESSION_TTL) return hit;

    // jsToken from the default host, then discover the account's real domain.
    let base = DEFAULT_BASE;
    let jsToken = await this.fetchJsToken(cookie, base);

    const probe = new URL(`${base}/api/list`);
    for (const [k, v] of Object.entries(COMMON)) probe.searchParams.set(k, v);
    probe.searchParams.set("jsToken", jsToken);
    probe.searchParams.set("dir", "/");
    probe.searchParams.set("num", "1");
    probe.searchParams.set("page", "1");
    const res = await fetch(probe, { headers: this.headers(cookie, base) });
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
    const res = await fetch(`${base}/main`, { headers: this.headers(cookie, base) });
    const html = await res.text();
    const m = /fn%28%22([0-9A-Fa-f]+)%22%29/.exec(html);
    if (!m || !m[1]) throw new Error("terabox: jsToken not found (cookie expired?)");
    return m[1];
  }

  private headers(cookie: string, base: string): Record<string, string> {
    return {
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${base}/`,
      "X-Requested-With": "XMLHttpRequest",
    };
  }
}
