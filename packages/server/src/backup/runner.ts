import { rm } from "node:fs/promises";
import path from "node:path";
import type { AppSettings, JobProgress } from "@drivehub/types";
import type { AppConfig } from "../config.js";
import { Repo, toJobPublic, toJobRun } from "../db/repo.js";
import type { Logger } from "../logger.js";
import type { EventBus } from "../engine/events.js";
import type { RcloneService, RcloneStats } from "../rclone/rclone.js";
import type { RemoteService } from "../rclone/remotes.js";
import type { ContainerQuiescer } from "../docker/quiesce.js";
import { createTarGz } from "./archive.js";
import { archiveStamp, computeNextRun } from "./schedule.js";

type JobRow = NonNullable<ReturnType<Repo["getJob"]>>;
export type RunTrigger = "manual" | "schedule" | "realtime";

export interface RunnerDeps {
  config: AppConfig;
  repo: Repo;
  remotes: RemoteService;
  rclone: RcloneService;
  quiescer: ContainerQuiescer;
  bus: EventBus;
  logger: Logger;
}

/**
 * Executes jobs via rclone. One job never runs concurrently with itself; the
 * scheduler may run different jobs in parallel. Emits live progress over the
 * bus (-> SSE) and records a run row for history.
 */
export class JobRunner {
  private running = new Set<string>();
  private sessionBytes = 0;

  constructor(private readonly d: RunnerDeps) {}

  isRunning(jobId: string): boolean {
    return this.running.has(jobId);
  }

  anyRunning(): number {
    return this.running.size;
  }

  sessionTransferred(): number {
    return this.sessionBytes;
  }

  async run(jobId: string, trigger: RunTrigger): Promise<void> {
    if (this.running.has(jobId)) {
      this.d.logger.debug({ jobId }, "job already running; skipping overlap");
      return;
    }
    const job = this.d.repo.getJob(jobId);
    if (!job) return;

    this.running.add(jobId);
    this.d.repo.updateJob(jobId, { lastStatus: "running" });
    this.emitJob(jobId);
    const run = this.d.repo.insertRun(jobId);
    this.d.bus.emit({ type: "run", payload: toJobRun(run) });
    this.activity("info", "job.start", `Started "${job.name}" (${trigger})`, jobId);

    let bytes = 0;
    let files = 0;
    try {
      if (job.type === "snapshot") {
        const res = await this.runSnapshot(job, run.id);
        bytes = res.bytes;
        files = res.files;
      } else {
        const res = await this.runSync(job, run.id);
        bytes = res.bytes;
        files = res.files;
      }
      this.sessionBytes += bytes;
      this.d.repo.finishRun(run.id, "success", { bytes, files, message: null });
      this.d.repo.updateJob(jobId, {
        lastStatus: "success",
        lastRunAt: Date.now(),
        lastError: null,
      });
      this.activity("success", "job.done", `Finished "${job.name}" — ${files} files, ${human(bytes)}`, jobId);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      this.d.repo.finishRun(run.id, "error", { bytes, files, message });
      this.d.repo.updateJob(jobId, { lastStatus: "error", lastError: message });
      this.activity("error", "job.error", `"${job.name}" failed: ${message}`, jobId);
    } finally {
      this.running.delete(jobId);
      this.bumpNextRun(jobId);
      const finished = this.d.repo.getJob(jobId);
      if (finished) this.d.bus.emit({ type: "run", payload: toJobRun(this.d.repo.listRuns(jobId, 1)[0]!) });
      this.emitJob(jobId);
    }
  }

  // ----- sync/copy/bisync -------------------------------------------------
  private async runSync(job: JobRow, runId: string): Promise<{ bytes: number; files: number }> {
    const source = this.d.remotes.target(job.sourceRemoteId, job.sourcePath);
    const dest = this.d.remotes.target(job.destRemoteId, job.destPath);
    const settings = this.d.repo.getSettings();

    const op = job.mode === "additive" ? "copy" : job.mode === "two_way" ? "bisync" : "sync";
    // iCloud is heavily rate-limited (ZONE_BUSY / HTTP 423); go gentle + retry.
    const slow =
      this.d.repo.getRemote(job.sourceRemoteId)?.type === "icloud" ||
      this.d.repo.getRemote(job.destRemoteId)?.type === "icloud";
    const extra = this.commonArgs(settings, op, slow);

    // bisync needs a one-time --resync to establish its baseline.
    if (op === "bisync") {
      const marker = `bisync_init_${job.id}`;
      if (!this.d.repo.kvGet(marker)) extra.push("--resync");
    }

    const acc = { bytes: 0, files: 0 };
    const result = await this.d.rclone.transfer(op, source, dest, extra, (s) => {
      acc.bytes = s.bytes;
      acc.files = s.transfers;
      this.emitProgress(job.id, runId, s);
    });

    if (result.code !== 0) {
      throw new Error(rcloneError(result.stderr));
    }
    if (op === "bisync") this.d.repo.kvSet(`bisync_init_${job.id}`, "1");

    return { bytes: acc.bytes, files: acc.files };
  }

  private commonArgs(settings: AppSettings, op: "sync" | "copy" | "bisync", slow = false): string[] {
    // Rate-limited backends (iCloud) do better with FEWER parallel ops + more
    // retries; everything else benefits from parallelism.
    if (slow) {
      const a = [
        "--transfers", "2",
        "--checkers", "2",
        "--tpslimit", "4",
        "--retries", "5",
        "--low-level-retries", "10",
        "--fast-list",
      ];
      if (settings.bandwidthLimit) a.push("--bwlimit", settings.bandwidthLimit);
      for (const pat of settings.excludePatterns) a.push("--exclude", pat);
      a.push("--create-empty-src-dirs");
      if (op === "bisync") a.push("--resilient");
      return a;
    }
    const args: string[] = [
      "--transfers",
      String(settings.concurrency),
      "--checkers",
      String(settings.concurrency * 2),
      "--fast-list",
      // Throughput tuning. Real speed comes from parallelism + bigger chunks,
      // not a single stream (which Google Drive throttles hard).
      "--drive-chunk-size",
      "64M", // larger upload chunks -> much faster Drive uploads
      "--drive-pacer-min-sleep",
      "10ms", // less API back-off between Drive calls (default 100ms)
      "--multi-thread-streams",
      "8", // split large single-file downloads across streams
      "--multi-thread-cutoff",
      "50M",
    ];
    if (settings.bandwidthLimit) args.push("--bwlimit", settings.bandwidthLimit);
    for (const pat of settings.excludePatterns) args.push("--exclude", pat);
    if (op !== "bisync") args.push("--create-empty-src-dirs");
    else args.push("--resilient", "--create-empty-src-dirs");
    return args;
  }

  // ----- snapshot ---------------------------------------------------------
  private async runSnapshot(job: JobRow, runId: string): Promise<{ bytes: number; files: number }> {
    const sourceRemote = this.d.repo.getRemote(job.sourceRemoteId);
    if (!sourceRemote || sourceRemote.type !== "local") {
      throw new Error("Snapshot jobs require a Local source (a folder to archive).");
    }
    const sourcePath = this.d.remotes.target(job.sourceRemoteId, job.sourcePath);
    const snap = toJobPublic(job).snapshot;
    const quiesce = toJobPublic(job).quiesceContainers;

    const stamp = archiveStamp(new Date());
    const archiveName = `${slug(job.name)}-${stamp}.tar.gz`;
    const tmpFile = path.join(this.d.config.DATA_DIR, "tmp", archiveName);

    // Pause containers for a consistent snapshot, always resume afterwards.
    const paused = await this.d.quiescer.pause(quiesce);
    let size = 0;
    try {
      size = await createTarGz(sourcePath, tmpFile, snap.compressionLevel);
    } finally {
      await this.d.quiescer.unpause(paused);
    }

    this.emitProgress(job.id, runId, {
      bytes: 0,
      totalBytes: size,
      transfers: 0,
      totalTransfers: 1,
      speed: 0,
      eta: null,
    });

    // Upload the archive.
    const destFile = this.d.remotes.target(
      job.destRemoteId,
      joinRemotePath(job.destPath, archiveName),
    );
    const settings = this.d.repo.getSettings();
    const args = ["copyto", tmpFile, destFile];
    if (settings.bandwidthLimit) args.push("--bwlimit", settings.bandwidthLimit);
    const res = await this.d.rclone.run(args);
    await rm(tmpFile, { force: true });
    if (res.code !== 0) throw new Error(rcloneError(res.stderr));

    await this.pruneSnapshots(job, snap.retentionKeep);
    return { bytes: size, files: 1 };
  }

  /** Keep only the newest `keep` archives for this job; trash the rest. */
  private async pruneSnapshots(job: JobRow, keep: number): Promise<void> {
    try {
      const listing = await this.d.remotes.browse(job.destRemoteId, job.destPath);
      const prefix = `${slug(job.name)}-`;
      const archives = listing.entries
        .filter((e) => !e.isDir && e.name.startsWith(prefix) && e.name.endsWith(".tar.gz"))
        .map((e) => e.name)
        .sort()
        .reverse(); // newest first (timestamp sorts lexically)
      const toDelete = archives.slice(Math.max(0, keep));
      for (const name of toDelete) {
        const target = this.d.remotes.target(job.destRemoteId, joinRemotePath(job.destPath, name));
        await this.d.rclone.run(["deletefile", target]);
        this.activity("info", "snapshot.prune", `Pruned old snapshot ${name}`, job.id);
      }
    } catch (e) {
      this.d.logger.warn({ err: String(e), jobId: job.id }, "snapshot prune failed");
    }
  }

  // ----- helpers ----------------------------------------------------------
  private bumpNextRun(jobId: string): void {
    const job = this.d.repo.getJob(jobId);
    if (!job) return;
    const schedule = toJobPublic(job).schedule;
    const next = computeNextRun(schedule, Date.now());
    this.d.repo.updateJob(jobId, { nextRunAt: next });
  }

  private emitProgress(jobId: string, runId: string, s: RcloneStats): void {
    const payload: JobProgress = {
      jobId,
      runId,
      status: "running",
      bytes: s.bytes,
      totalBytes: s.totalBytes,
      files: s.transfers,
      speedBytesPerSec: s.speed,
      etaSeconds: s.eta,
      currentFile: s.transferring?.[0]?.name ?? null,
    };
    this.d.bus.emit({ type: "progress", payload });
  }

  private emitJob(jobId: string): void {
    const job = this.d.repo.getJob(jobId);
    if (job) this.d.bus.emit({ type: "job", payload: toJobPublic(job) });
  }

  private activity(
    level: "info" | "success" | "warning" | "error",
    code: string,
    message: string,
    jobId?: string,
  ): void {
    const ev = this.d.repo.addActivity({ at: Date.now(), level, code, message, jobId });
    this.d.bus.emit({ type: "activity", payload: ev });
  }
}

function rcloneError(stderr: string): string {
  const lines = stderr.split("\n").filter((l) => /error|fatal|failed/i.test(l));
  return (lines.pop() ?? stderr.split("\n").filter(Boolean).pop() ?? "rclone failed").slice(0, 300);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "backup";
}

function joinRemotePath(base: string, name: string): string {
  const b = (base ?? "").replace(/\/+$/, "");
  return b ? `${b}/${name}` : name;
}

function human(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
