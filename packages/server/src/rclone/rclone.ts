import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Logger } from "../logger.js";

export interface RcloneResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RcloneStats {
  bytes: number;
  totalBytes: number;
  transfers: number;
  totalTransfers: number;
  speed: number;
  eta: number | null;
  transferring?: Array<{ name?: string }>;
}

export interface AboutResult {
  total: number | null;
  used: number | null;
  free: number | null;
  trashed: number | null;
}

/**
 * Thin wrapper around the rclone binary. All storage access in DriveHub goes
 * through here. We pass an explicit --config so rclone never touches the host
 * user's global config, and never log secret-bearing argv.
 */
export class RcloneService {
  constructor(
    private readonly configPath: string,
    private readonly logger: Logger,
    private readonly bin: string = process.env.RCLONE_BIN ?? "rclone",
  ) {}

  private baseArgs(): string[] {
    return ["--config", this.configPath];
  }

  /** Run rclone to completion, capturing stdout/stderr. */
  async run(args: string[], opts: { redactFrom?: number } = {}): Promise<RcloneResult> {
    const full = [...this.baseArgs(), ...args];
    const child = spawn(this.bin, full, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const [code] = (await once(child, "close")) as [number];
    if (code !== 0) {
      const safe = opts.redactFrom != null ? args.slice(0, opts.redactFrom) : args;
      this.logger.debug({ args: safe, code, stderr: stderr.slice(0, 500) }, "rclone non-zero exit");
    }
    return { code: code ?? -1, stdout, stderr };
  }

  async version(): Promise<string | null> {
    try {
      const { code, stdout } = await this.run(["version"]);
      if (code !== 0) return null;
      const first = stdout.split("\n")[0]?.trim() ?? "";
      return first.replace(/^rclone\s+/i, "") || null;
    } catch {
      return null;
    }
  }

  async available(): Promise<boolean> {
    return (await this.version()) !== null;
  }

  /** Obscure a password into rclone's reversible-obscured form. */
  async obscure(plain: string): Promise<string> {
    const child = spawn(this.bin, ["obscure", plain], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    const [code] = (await once(child, "close")) as [number];
    if (code !== 0) throw new Error("rclone obscure failed");
    return out.trim();
  }

  /**
   * Create or update a remote in the config. `params` are rclone config keys;
   * secret values should already be obscured where the backend expects it.
   */
  async configCreate(
    name: string,
    type: string,
    params: Record<string, string>,
  ): Promise<void> {
    const kv: string[] = [];
    for (const [k, v] of Object.entries(params)) kv.push(k, v);
    const { code, stderr } = await this.run(
      ["config", "create", name, type, ...kv, "--non-interactive", "--obscure"],
      { redactFrom: 4 },
    );
    if (code !== 0) throw new Error(`rclone config create failed: ${stderr.slice(0, 300)}`);
  }

  async configDelete(name: string): Promise<void> {
    await this.run(["config", "delete", name]);
  }

  async configDump(): Promise<Record<string, Record<string, string>>> {
    const { code, stdout } = await this.run(["config", "dump"]);
    if (code !== 0) return {};
    try {
      return JSON.parse(stdout);
    } catch {
      return {};
    }
  }

  /** List a remote path. `target` is "remoteName:subpath". */
  async lsjson(target: string): Promise<
    Array<{ Name: string; Path: string; IsDir: boolean; Size: number; ModTime: string; MimeType?: string }>
  > {
    const { code, stdout, stderr } = await this.run([
      "lsjson",
      target,
      "--no-modtime=false",
    ]);
    if (code !== 0) throw new Error(`rclone lsjson failed: ${stderr.slice(0, 300)}`);
    try {
      return JSON.parse(stdout);
    } catch {
      return [];
    }
  }

  async about(remoteName: string): Promise<AboutResult> {
    const { code, stdout } = await this.run(["about", `${remoteName}:`, "--json"]);
    if (code !== 0) return { total: null, used: null, free: null, trashed: null };
    try {
      const j = JSON.parse(stdout) as Record<string, number>;
      return {
        total: j.total ?? null,
        used: j.used ?? null,
        free: j.free ?? null,
        trashed: j.trashed ?? null,
      };
    } catch {
      return { total: null, used: null, free: null, trashed: null };
    }
  }

  /** Quick connectivity check: can we list the root of this remote? */
  async testRemote(remoteName: string): Promise<{ ok: boolean; error?: string }> {
    const { code, stderr } = await this.run(["lsd", `${remoteName}:`, "--max-depth", "1"]);
    return code === 0 ? { ok: true } : { ok: false, error: stderr.slice(0, 300) };
  }

  /**
   * Run a transfer operation (sync/copy/bisync), streaming rclone's JSON stats
   * via onStats. Resolves with the final result when the process exits.
   */
  async transfer(
    op: "sync" | "copy" | "bisync",
    source: string,
    dest: string,
    extraArgs: string[],
    onStats: (s: RcloneStats) => void,
  ): Promise<RcloneResult> {
    const args = [
      ...this.baseArgs(),
      op,
      source,
      dest,
      "--use-json-log",
      "--stats",
      "1s",
      "--stats-log-level",
      "NOTICE",
      "-v",
      ...extraArgs,
    ];
    const child = spawn(this.bin, args, { windowsHide: true });
    let stderrTail = "";

    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      stderrTail = (stderrTail + line + "\n").slice(-2000);
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      try {
        const obj = JSON.parse(trimmed) as { stats?: Record<string, unknown> };
        if (obj.stats) {
          const s = obj.stats;
          onStats({
            bytes: Number(s.bytes ?? 0),
            totalBytes: Number(s.totalBytes ?? 0),
            transfers: Number(s.transfers ?? 0),
            totalTransfers: Number(s.totalTransfers ?? 0),
            speed: Number(s.speed ?? 0),
            eta: s.eta == null ? null : Number(s.eta),
            transferring: (s.transferring as Array<{ name?: string }>) ?? [],
          });
        }
      } catch {
        /* ignore non-JSON log lines */
      }
    });

    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    const [code] = (await once(child, "close")) as [number];
    return { code: code ?? -1, stdout, stderr: stderrTail };
  }
}
