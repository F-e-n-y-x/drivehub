import type { Logger } from "../logger.js";
import { Repo, toJobPublic } from "../db/repo.js";
import { IgnoreMatcher } from "../engine/ignore.js";
import { HubWatcher } from "../engine/watcher.js";
import type { RemoteService } from "../rclone/remotes.js";
import type { JobRunner } from "./runner.js";
import { computeNextRun } from "./schedule.js";

interface RealtimeWatch {
  watcher: HubWatcher;
  debounce: NodeJS.Timeout | null;
}

const REALTIME_DEBOUNCE_MS = 4000;

/**
 * Drives jobs on time (interval/daily/weekly) via a periodic tick, and runs
 * realtime jobs by watching their local source folder. Cloud-source realtime
 * isn't possible, so such jobs fall back to a frequent interval.
 */
export class Scheduler {
  private tick: NodeJS.Timeout | null = null;
  private watches = new Map<string, RealtimeWatch>();

  constructor(
    private readonly repo: Repo,
    private readonly runner: JobRunner,
    private readonly remotes: RemoteService,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.reload();
    this.tick = setInterval(() => this.onTick(), 15_000);
  }

  stop(): void {
    if (this.tick) clearInterval(this.tick);
    for (const w of this.watches.values()) {
      if (w.debounce) clearTimeout(w.debounce);
      void w.watcher.stop();
    }
    this.watches.clear();
  }

  /** Recompute timers + realtime watchers after any job/remote change. */
  reload(): void {
    const jobs = this.repo.listJobs().map(toJobPublic);
    const now = Date.now();

    // Seed nextRunAt for time-based jobs that don't have one yet.
    for (const job of jobs) {
      if (!job.enabled) continue;
      if (["interval", "daily", "weekly"].includes(job.schedule.kind) && !job.nextRunAt) {
        this.repo.updateJob(job.id, { nextRunAt: computeNextRun(job.schedule, now) });
      }
    }

    // Reconcile realtime watchers.
    const realtimeJobs = jobs.filter((j) => j.enabled && j.schedule.kind === "realtime");
    const wantIds = new Set<string>();
    for (const job of realtimeJobs) {
      const source = this.repo.getRemote(job.sourceRemoteId);
      if (!source || source.type !== "local") {
        // Can't watch a cloud source — let the tick handle it as a fallback.
        continue;
      }
      wantIds.add(job.id);
      if (!this.watches.has(job.id)) this.startWatch(job.id);
    }
    for (const [id, w] of this.watches) {
      if (!wantIds.has(id)) {
        if (w.debounce) clearTimeout(w.debounce);
        void w.watcher.stop();
        this.watches.delete(id);
      }
    }
  }

  private startWatch(jobId: string): void {
    const job = this.repo.getJob(jobId);
    if (!job) return;
    const pub = toJobPublic(job);
    let watchPath: string;
    try {
      watchPath = this.remotes.target(pub.sourceRemoteId, pub.sourcePath);
    } catch (e) {
      this.logger.error({ err: String(e), jobId }, "cannot resolve realtime watch path");
      return;
    }
    const ignore = new IgnoreMatcher(this.repo.getSettings().excludePatterns);
    const watcher = new HubWatcher(watchPath, ignore, () => this.onLocalChange(jobId));
    watcher.start();
    this.watches.set(jobId, { watcher, debounce: null });
    this.logger.info({ jobId, watchPath }, "realtime watch started");
  }

  private onLocalChange(jobId: string): void {
    const w = this.watches.get(jobId);
    if (!w) return;
    if (w.debounce) clearTimeout(w.debounce);
    w.debounce = setTimeout(() => {
      void this.runner.run(jobId, "realtime");
    }, REALTIME_DEBOUNCE_MS);
  }

  private onTick(): void {
    const now = Date.now();
    for (const job of this.repo.listJobs().map(toJobPublic)) {
      if (!job.enabled) continue;
      const kind = job.schedule.kind;
      if (kind === "manual") continue;
      // realtime-with-cloud-source fallback: run on the interval cadence.
      const isTimeBased = kind === "interval" || kind === "daily" || kind === "weekly";
      const isFallback = kind === "realtime" && !this.watches.has(job.id);
      if (!isTimeBased && !isFallback) continue;
      if (job.nextRunAt && job.nextRunAt <= now && !this.runner.isRunning(job.id)) {
        void this.runner.run(job.id, "schedule");
      } else if (!job.nextRunAt) {
        this.repo.updateJob(job.id, {
          nextRunAt: computeNextRun(
            isFallback ? { kind: "interval", intervalMinutes: 10 } : job.schedule,
            now,
          ),
        });
      }
    }
  }
}
