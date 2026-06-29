import type { ComponentUpdate, UpdateStatus } from "@drivehub/types";
import type { Logger } from "../logger.js";
import type { RcloneService } from "../rclone/rclone.js";

const RCLONE_VERSION_URL = "https://downloads.rclone.org/version.txt";
const REPO = "F-e-n-y-x/drivehub";
const GITHUB_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const GITHUB_BRANCH_URL = `https://api.github.com/repos/${REPO}/commits/main`;
const CACHE_MS = 60 * 60 * 1000; // 1h

/**
 * Checks for available updates:
 *  - rclone: compares the running binary to the latest published version, and
 *    can update it in place via `rclone selfupdate`.
 *  - the app: for a tagged release build (APP_VERSION = X.Y.Z) it compares to
 *    the latest GitHub release; for a rolling "main" build it compares the
 *    baked git commit (GIT_SHA) to the latest commit on main. The app updates
 *    by redeploying the container, so this is informational.
 */
export class UpdateService {
  private cache: UpdateStatus | null = null;

  constructor(
    private readonly rclone: RcloneService,
    private readonly appVersion: string,
    private readonly gitSha: string | null,
    private readonly dockerAvailable: () => boolean,
    private readonly logger: Logger,
  ) {}

  async check(force = false): Promise<UpdateStatus> {
    if (!force && this.cache && Date.now() - this.cache.checkedAt < CACHE_MS) {
      return this.cache;
    }
    const [rcloneCurrentRaw, rcloneLatest, releaseTag, branchSha] = await Promise.all([
      this.rclone.version(),
      fetchText(RCLONE_VERSION_URL),
      fetchGithubLatestRelease(),
      fetchDefaultBranchSha(),
    ]);

    const rcloneCurrent = normalize(rcloneCurrentRaw);
    const rclone: ComponentUpdate = {
      name: "rclone",
      current: rcloneCurrent,
      latest: normalize(rcloneLatest),
      updateAvailable: isNewer(normalize(rcloneLatest), rcloneCurrent),
      canSelfUpdate: true,
    };

    const app = this.buildAppUpdate(releaseTag, branchSha);

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

  private buildAppUpdate(releaseTag: string | null, branchSha: string | null): ComponentUpdate {
    const semver = parseSemver(normalize(this.appVersion));
    if (semver) {
      // Tagged release build → compare to the latest GitHub release.
      const latest = normalize(releaseTag);
      return {
        name: "drivehub",
        current: this.appVersion,
        latest,
        updateAvailable: isNewer(latest, normalize(this.appVersion)),
        canSelfUpdate: false,
      };
    }
    // Rolling "main" build → compare baked commit to the latest commit on main.
    const cur = this.gitSha ? this.gitSha.slice(0, 7) : null;
    const latest = branchSha ? branchSha.slice(0, 7) : null;
    return {
      name: "drivehub",
      current: cur ? `${this.appVersion} @ ${cur}` : this.appVersion,
      latest: latest ? `${this.appVersion} @ ${latest}` : null,
      updateAvailable: Boolean(cur && latest && cur !== latest),
      canSelfUpdate: false,
    };
  }

  async updateRclone(): Promise<{ ok: boolean; message: string }> {
    this.logger.info("running rclone selfupdate");
    const result = await this.rclone.selfUpdate();
    this.cache = null;
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

async function fetchGithubJson<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "drivehub", Accept: "application/vnd.github+json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchGithubLatestRelease(): Promise<string | null> {
  const json = await fetchGithubJson<{ tag_name?: string }>(GITHUB_RELEASE_URL);
  return json?.tag_name ?? null;
}

async function fetchDefaultBranchSha(): Promise<string | null> {
  const json = await fetchGithubJson<{ sha?: string }>(GITHUB_BRANCH_URL);
  return json?.sha ?? null;
}

function parseSemver(v: string | null): [number, number, number] | null {
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Extract a comparable vX.Y.Z (or return the trimmed string). */
function normalize(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/v?\d+\.\d+\.\d+/);
  return m ? m[0].replace(/^v/, "") : v.trim();
}

/** True only if both are real X.Y.Z versions and `latest` is strictly greater. */
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
