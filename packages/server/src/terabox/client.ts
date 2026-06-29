import type { Logger } from "../logger.js";

/**
 * Minimal TeraBox download resolver. The bundled rclone-extra `terabox` backend
 * can list/upload but its downloads fail, so for streaming/downloading we hit
 * TeraBox's unofficial web API directly (the same flow OpenList/AList use):
 *   1. scrape a `jsToken` from the homepage,
 *   2. call `/api/filemetas?...&dlink=1&origin=dlna` for a file path → a `dlink`.
 * The dlink is a CDN URL that supports HTTP Range, so video seeking works. This
 * is unofficial and may break if TeraBox changes their site; callers should
 * fall back gracefully.
 */

// TeraBox checks for its desktop client UA on the download endpoints.
const UA = "terabox;1.37.0.7;PC;PC-Windows;10.0.22631;WindowsTeraBox";
const DEFAULT_BASE = "https://www.terabox.com";
const COMMON = { app_id: "250528", web: "1", channel: "dubox", clienttype: "0" };

interface CacheEntry {
  jsToken: string;
  base: string;
  at: number;
}

export class TeraBoxClient {
  // jsToken (and the resolved domain) cached per cookie for a few minutes.
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly logger: Logger) {}

  /** Resolve a directly-downloadable URL (+ headers) for a file path. */
  async resolveDownload(
    cookie: string,
    filePath: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const target = filePath.startsWith("/") ? filePath : `/${filePath}`;
    let { jsToken, base } = await this.session(cookie);

    for (let attempt = 0; attempt < 2; attempt++) {
      const url = new URL(`${base}/api/filemetas`);
      for (const [k, v] of Object.entries(COMMON)) url.searchParams.set(k, v);
      url.searchParams.set("jsToken", jsToken);
      url.searchParams.set("target", JSON.stringify([target]));
      url.searchParams.set("dlink", "1");
      url.searchParams.set("origin", "dlna");

      const res = await fetch(url, { headers: this.authHeaders(cookie, base) });
      const body = (await res.json().catch(() => ({}))) as {
        errno?: number;
        info?: Array<{ dlink?: string }>;
        ["Url-Domain-Prefix"]?: string;
      };

      // -6 → wrong domain for this account; retry on the prefixed host.
      if (body.errno === -6 && attempt === 0) {
        const prefix = body["Url-Domain-Prefix"];
        if (prefix) base = `https://${prefix}.terabox.com`;
        ({ jsToken } = await this.refresh(cookie, base));
        continue;
      }
      const dlink = body.info?.[0]?.dlink;
      if (body.errno === 0 && dlink) {
        return { url: dlink, headers: { "User-Agent": UA, Cookie: cookie, Referer: `${base}/` } };
      }
      // Likely a stale jsToken — refresh once and retry.
      if (attempt === 0) {
        ({ jsToken } = await this.refresh(cookie, base));
        continue;
      }
      throw new Error(`terabox filemetas errno=${body.errno ?? "?"}`);
    }
    throw new Error("terabox: could not resolve download link");
  }

  private authHeaders(cookie: string, base: string): Record<string, string> {
    return {
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${base}/`,
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  private async session(cookie: string): Promise<CacheEntry> {
    const hit = this.cache.get(cookie);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
    return this.refresh(cookie, DEFAULT_BASE);
  }

  private async refresh(cookie: string, base: string): Promise<CacheEntry> {
    const res = await fetch(`${base}/main`, { headers: this.authHeaders(cookie, base) });
    const html = await res.text();
    const jsToken = extractJsToken(html);
    if (!jsToken) throw new Error("terabox: jsToken not found (cookie expired?)");
    const entry: CacheEntry = { jsToken, base, at: Date.now() };
    this.cache.set(cookie, entry);
    this.logger.debug({ base }, "terabox jsToken refreshed");
    return entry;
  }
}

/** jsToken is injected as `...fn("<token>")...` (URL-encoded) in the page. */
function extractJsToken(html: string): string | null {
  const m =
    /fn%28%22([0-9A-Fa-f]+)%22%29/.exec(html) ?? /window\.jsToken[^"']*["']([0-9A-Fa-f]+)["']/.exec(html);
  return m && m[1] ? m[1] : null;
}
