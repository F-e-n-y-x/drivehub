import path from "node:path";
import type { AppStats, EngineStatus } from "@drivehub/types";
import type { AppConfig } from "./config.js";
import type { DB } from "./db/index.js";
import { Repo } from "./db/repo.js";
import type { Logger } from "./logger.js";
import { EventBus } from "./engine/events.js";
import { RcloneService } from "./rclone/rclone.js";
import { RemoteService } from "./rclone/remotes.js";
import { ContainerQuiescer } from "./docker/quiesce.js";
import { JobRunner } from "./backup/runner.js";
import { Scheduler } from "./backup/scheduler.js";
import { UpdateService } from "./updates/service.js";

const APP_VERSION = process.env.APP_VERSION ?? "0.1.0";

/**
 * Top-level wiring. Owns the rclone service, the remote/job services, the
 * runner and scheduler, and the event bus the HTTP layer streams to browsers.
 */
export class Orchestrator {
  readonly bus = new EventBus();
  readonly repo: Repo;
  readonly rclone: RcloneService;
  readonly remotes: RemoteService;
  readonly runner: JobRunner;
  readonly quiescer: ContainerQuiescer;
  readonly updates: UpdateService;
  private readonly scheduler: Scheduler;

  private mode: "running" | "paused" = "running";
  private rcloneVersion: string | null = null;

  constructor(
    private readonly config: AppConfig,
    db: DB,
    private readonly logger: Logger,
  ) {
    this.repo = new Repo(db);
    this.rclone = new RcloneService(path.join(config.DATA_DIR, "rclone.conf"), logger, config.RCLONE_BIN);
    this.remotes = new RemoteService(config, this.repo, this.rclone, logger);
    this.quiescer = new ContainerQuiescer(logger);
    this.runner = new JobRunner({
      config,
      repo: this.repo,
      remotes: this.remotes,
      rclone: this.rclone,
      quiescer: this.quiescer,
      bus: this.bus,
      logger,
    });
    this.scheduler = new Scheduler(this.repo, this.runner, this.remotes, logger);
    this.updates = new UpdateService(
      this.rclone,
      APP_VERSION,
      () => this.quiescer.available(),
      logger,
    );
  }

  async start(): Promise<void> {
    this.rcloneVersion = await this.rclone.version();
    if (!this.rcloneVersion) {
      this.logger.error(
        "rclone binary not found. Install rclone or set RCLONE_BIN. Storage operations will fail until then.",
      );
    } else {
      this.logger.info({ version: this.rcloneVersion }, "rclone ready");
    }
    // Re-materialize rclone.conf from the DB (the source of truth).
    await this.remotes.rebuildConfig();
    this.scheduler.start();
    this.broadcastStatus();

    // Background update check (don't block startup).
    void this.updates
      .check()
      .then((u) => this.bus.emit({ type: "updates", payload: u }))
      .catch(() => {});
  }

  async stop(): Promise<void> {
    this.scheduler.stop();
  }

  pause(): void {
    this.mode = "paused";
    this.scheduler.stop();
    this.broadcastStatus();
  }

  resume(): void {
    this.mode = "running";
    this.scheduler.start();
    this.broadcastStatus();
  }

  /** Run a job immediately (manual trigger). */
  async runJob(jobId: string): Promise<void> {
    await this.runner.run(jobId, "manual");
  }

  onRemotesChanged(): void {
    this.scheduler.reload();
    this.broadcastStatus();
  }

  onJobsChanged(): void {
    this.scheduler.reload();
    this.broadcastStatus();
  }

  stats(): AppStats {
    const jobs = this.repo.listJobs();
    return {
      remotes: this.repo.listRemotes().length,
      jobs: jobs.length,
      jobsEnabled: jobs.filter((j) => j.enabled).length,
      runningJobs: this.runner.anyRunning(),
      lastErrorAt: this.repo.lastErrorAt(),
      bytesTransferredSession: this.runner.sessionTransferred(),
    };
  }

  getStatus(): EngineStatus {
    return {
      mode: this.mode,
      rcloneVersion: this.rcloneVersion,
      rcloneAvailable: this.rcloneVersion !== null,
      dockerAvailable: this.quiescer.available(),
      stats: this.stats(),
    };
  }

  broadcastStatus(): void {
    this.bus.emit({ type: "status", payload: this.getStatus() });
  }
}
