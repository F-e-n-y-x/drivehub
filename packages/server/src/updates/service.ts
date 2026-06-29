import type { ComponentUpdate, UpdateStatus } from "@drivehub/types";
import type { Logger } from "../logger.js";
import type { RcloneService } from "../rclone/rclone.js";

const RCLONE_VERSION_URL = "https://downloads.rclone.org/version.txt";
const GITHUB_RELEASE_URL = "https://api.github.com/repos/F-e-n-y-x/drivehub/releases/latest";
const CACHE_MS = 60 * 60 * 1000; // 1h

/**
 * Checks for available updates:
 *  - rclone: compares the running binary to the latest published version, and
 *    can update it in place via `rclone selfupdate`.
 *  - the app itself: compares APP_VERSION to the latest GitHub release. The app
 *    updates by redeploying the container, so this is informational.
 */
export class UpdateService {
  private cache: UpdateStatus | null = null;

  constructor(
    private readonly rclone: RcloneService,
    private readonly appVersion: string,
    private readonly dockerAvailable: () => boolean,
    private readonly logger: Logger,
  ) {}

  async check(force = false): Promise<UpdateStatus> {
    if (!force && this.cache && Date.now() - this.cache.checkedAt < CACHE_MS) {
      return this.cache;
    }
    const [rcloneCurrentRaw, rcloneLatest, appLatest] = await Promise.all([
      this.rclone.version(),
      fetchText(RCLONE_VERSION_URL),
      fetchGithubLatest(),
    ]);

    const rcloneCurrent = normalize(rcloneCurrentRaw);
    const rclone: ComponentUpdate = {
      name: "rclone",
      current: rcloneCurrent,
      latest: normalize(rcloneLatest),
      updateAvailable: isNewer(normalize(rcloneLatest), rcloneCurrent),
      canSelfUpdate: true,
    };

    const appCurrent = normalize(this.appVersion);
    const app: ComponentUpdate = {
      name: "drivehub",
      current: appCurrent,
      latest: normalize(appLatest),
      updateAvailable: isNewer(normalize(appLatest), appCurrent),
      canSelfUpdate: false,
    };

    const status: UpdateStatus = {
      rclone,
      app,
      dockerAvailable: this.dockerAvailable(),
      checkedAt: Date.now(),
      anyAvailable: rclone.updateAvailable || app.updateAvailable,
    };
    this.cache = status;
    return status;
  }

  async updateRclone(): Promise<{ ok: boolean; message: string }> {
    this.logger.info("running rclone selfupdate");
    const result = await this.rclone.selfUpdate();
    this.cache = null; // force a re-check next time
    return result;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function fetchGithubLatest(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(GITHUB_RELEASE_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "drivehub", Accept: "application/vnd.github+json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { tag_name?: string };
    return json.tag_name ?? null;
  } catch {
    return null;
  }
}

/** Extract a comparable vX.Y.Z (or return the trimmed string). */
function normalize(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/v?\d+\.\d+\.\d+/);
  return m ? m[0].replace(/^v/, "") : v.trim();
}

function parseSemver(v: string | null): [number, number, number] | null {
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * True only if BOTH sides are real X.Y.Z versions and `latest` is strictly
 * greater. If `current` isn't a released version (e.g. a "main"/SHA dev build),
 * we never claim an update — avoids false positives on freshly-pulled images.
 */
function isNewer(latest: string | null, current: string | null): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}
