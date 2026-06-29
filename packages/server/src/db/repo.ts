import { desc, eq, inArray, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ActivityEvent,
  AppSettings,
  JobMode,
  JobPublic,
  JobRun,
  JobStatus,
  JobType,
  RemotePublic,
  RemoteStatus,
  RemoteType,
  Schedule,
  SnapshotOptions,
} from "@drivehub/types";
import type { DB } from "./index.js";
import { activity, jobRuns, jobs, kv, remotes } from "./schema.js";

const SETTINGS_KEY = "settings";

export const DEFAULT_SETTINGS: AppSettings = {
  concurrency: 4,
  excludePatterns: [
    ".git/**",
    "node_modules/**",
    "**/*.tmp",
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/*-wal",
    "**/*-shm",
  ],
  bandwidthLimit: "",
  theme: "system",
};

type RemoteRow = typeof remotes.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type JobRunRow = typeof jobRuns.$inferSelect;

/** Single typed gateway to the v2 store (remotes, jobs, runs, activity). */
export class Repo {
  constructor(private readonly db: DB) {}

  // ----- remotes ----------------------------------------------------------
  listRemotes(): RemoteRow[] {
    return this.db.select().from(remotes).all();
  }

  getRemote(id: string): RemoteRow | undefined {
    return this.db.select().from(remotes).where(eq(remotes.id, id)).get();
  }

  getRemoteByName(name: string): RemoteRow | undefined {
    return this.db.select().from(remotes).where(eq(remotes.name, name)).get();
  }

  insertRemote(input: {
    name: string;
    type: RemoteType;
    label: string;
    configEnc: string;
    summary: Record<string, string>;
    status?: RemoteStatus;
  }): RemoteRow {
    const id = `rmt_${nanoid(12)}`;
    this.db
      .insert(remotes)
      .values({
        id,
        name: input.name,
        type: input.type,
        label: input.label,
        configEnc: input.configEnc,
        summary: JSON.stringify(input.summary),
        status: input.status ?? "ok",
        createdAt: Date.now(),
      })
      .run();
    return this.getRemote(id)!;
  }

  updateRemote(id: string, patch: Partial<RemoteRow>): void {
    this.db.update(remotes).set(patch).where(eq(remotes.id, id)).run();
  }

  setRemoteStatus(id: string, status: RemoteStatus): void {
    this.db.update(remotes).set({ status }).where(eq(remotes.id, id)).run();
  }

  deleteRemote(id: string): void {
    this.db.delete(remotes).where(eq(remotes.id, id)).run();
  }

  // ----- jobs -------------------------------------------------------------
  listJobs(): JobRow[] {
    return this.db.select().from(jobs).all();
  }

  listEnabledJobs(): JobRow[] {
    return this.db.select().from(jobs).where(eq(jobs.enabled, true)).all();
  }

  getJob(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  insertJob(input: {
    name: string;
    type: JobType;
    sourceRemoteId: string;
    sourcePath: string;
    destRemoteId: string;
    destPath: string;
    mode: JobMode;
    schedule: Schedule;
    enabled: boolean;
    snapshot: SnapshotOptions;
    quiesceContainers: string[];
  }): JobRow {
    const id = `job_${nanoid(12)}`;
    this.db
      .insert(jobs)
      .values({
        id,
        name: input.name,
        type: input.type,
        sourceRemoteId: input.sourceRemoteId,
        sourcePath: input.sourcePath,
        destRemoteId: input.destRemoteId,
        destPath: input.destPath,
        mode: input.mode,
        scheduleJson: JSON.stringify(input.schedule),
        enabled: input.enabled,
        snapshotJson: JSON.stringify(input.snapshot),
        quiesceJson: JSON.stringify(input.quiesceContainers),
        lastStatus: "idle",
        createdAt: Date.now(),
      })
      .run();
    return this.getJob(id)!;
  }

  updateJobConfig(
    id: string,
    input: {
      name: string;
      type: JobType;
      sourceRemoteId: string;
      sourcePath: string;
      destRemoteId: string;
      destPath: string;
      mode: JobMode;
      schedule: Schedule;
      enabled: boolean;
      snapshot: SnapshotOptions;
      quiesceContainers: string[];
    },
  ): void {
    this.db
      .update(jobs)
      .set({
        name: input.name,
        type: input.type,
        sourceRemoteId: input.sourceRemoteId,
        sourcePath: input.sourcePath,
        destRemoteId: input.destRemoteId,
        destPath: input.destPath,
        mode: input.mode,
        scheduleJson: JSON.stringify(input.schedule),
        enabled: input.enabled,
        snapshotJson: JSON.stringify(input.snapshot),
        quiesceJson: JSON.stringify(input.quiesceContainers),
      })
      .where(eq(jobs.id, id))
      .run();
  }

  updateJob(id: string, patch: Partial<JobRow>): void {
    this.db.update(jobs).set(patch).where(eq(jobs.id, id)).run();
  }

  deleteJob(id: string): void {
    this.db.delete(jobs).where(eq(jobs.id, id)).run();
    this.db.delete(jobRuns).where(eq(jobRuns.jobId, id)).run();
  }

  // ----- job runs ---------------------------------------------------------
  insertRun(jobId: string): JobRunRow {
    const id = `run_${nanoid(12)}`;
    this.db
      .insert(jobRuns)
      .values({ id, jobId, startedAt: Date.now(), status: "running" })
      .run();
    return this.db.select().from(jobRuns).where(eq(jobRuns.id, id)).get()!;
  }

  finishRun(
    id: string,
    status: JobStatus,
    data: { bytes?: number; files?: number; message?: string | null },
  ): JobRunRow {
    this.db
      .update(jobRuns)
      .set({
        status,
        finishedAt: Date.now(),
        bytesTransferred: data.bytes ?? 0,
        filesTransferred: data.files ?? 0,
        message: data.message ?? null,
      })
      .where(eq(jobRuns.id, id))
      .run();
    return this.db.select().from(jobRuns).where(eq(jobRuns.id, id)).get()!;
  }

  listRuns(jobId: string, limit = 50): JobRunRow[] {
    return this.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit)
      .all();
  }

  recentRuns(limit = 50): JobRunRow[] {
    return this.db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit)
      .all();
  }

  countRunningRuns(): number {
    return this.db
      .select()
      .from(jobRuns)
      .where(inArray(jobRuns.status, ["running", "queued"]))
      .all().length;
  }

  // ----- activity ---------------------------------------------------------
  addActivity(ev: Omit<ActivityEvent, "id">): ActivityEvent {
    const id = `act_${nanoid(12)}`;
    this.db
      .insert(activity)
      .values({
        id,
        at: ev.at,
        level: ev.level,
        code: ev.code,
        message: ev.message,
        jobId: ev.jobId ?? null,
        remoteId: ev.remoteId ?? null,
      })
      .run();
    return { id, ...ev };
  }

  recentActivity(limit = 100, search?: string): ActivityEvent[] {
    const base = this.db.select().from(activity);
    const rows = (search ? base.where(like(activity.message, `%${search}%`)) : base)
      .orderBy(desc(activity.at))
      .limit(limit)
      .all();
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      level: r.level as ActivityEvent["level"],
      code: r.code,
      message: r.message,
      jobId: r.jobId ?? undefined,
      remoteId: r.remoteId ?? undefined,
    }));
  }

  lastErrorAt(): number | null {
    const row = this.db
      .select()
      .from(activity)
      .where(eq(activity.level, "error"))
      .orderBy(desc(activity.at))
      .limit(1)
      .get();
    return row?.at ?? null;
  }

  // ----- generic kv -------------------------------------------------------
  kvGet(key: string): string | null {
    const row = this.db.select().from(kv).where(eq(kv.key, key)).get();
    return row?.value ?? null;
  }

  kvSet(key: string, value: string): void {
    const existing = this.db.select().from(kv).where(eq(kv.key, key)).get();
    if (existing) {
      this.db.update(kv).set({ value }).where(eq(kv.key, key)).run();
    } else {
      this.db.insert(kv).values({ key, value }).run();
    }
  }

  // ----- settings ---------------------------------------------------------
  getSettings(): AppSettings {
    const row = this.db.select().from(kv).where(eq(kv.key, SETTINGS_KEY)).get();
    if (!row) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  setSettings(settings: AppSettings): void {
    const value = JSON.stringify(settings);
    const existing = this.db.select().from(kv).where(eq(kv.key, SETTINGS_KEY)).get();
    if (existing) {
      this.db.update(kv).set({ value }).where(eq(kv.key, SETTINGS_KEY)).run();
    } else {
      this.db.insert(kv).values({ key: SETTINGS_KEY, value }).run();
    }
  }
}

// ----- mappers ------------------------------------------------------------
export function toRemotePublic(row: RemoteRow): RemotePublic {
  let summary: Record<string, string> = {};
  try {
    summary = JSON.parse(row.summary);
  } catch {
    /* keep empty */
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type as RemoteType,
    label: row.label,
    summary,
    status: row.status as RemoteStatus,
    createdAt: row.createdAt,
  };
}

export function toJobPublic(row: JobRow): JobPublic {
  const schedule = safeParse<Schedule>(row.scheduleJson, { kind: "manual" });
  const snapshot = safeParse<SnapshotOptions>(row.snapshotJson, {
    retentionKeep: 7,
    compressionLevel: 6,
  });
  const quiesce = safeParse<string[]>(row.quiesceJson, []);
  return {
    id: row.id,
    name: row.name,
    type: row.type as JobType,
    sourceRemoteId: row.sourceRemoteId,
    sourcePath: row.sourcePath,
    destRemoteId: row.destRemoteId,
    destPath: row.destPath,
    mode: row.mode as JobMode,
    schedule,
    enabled: row.enabled,
    snapshot,
    quiesceContainers: quiesce,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus as JobStatus,
    lastError: row.lastError,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
  };
}

export function toJobRun(row: JobRunRow): JobRun {
  return {
    id: row.id,
    jobId: row.jobId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status as JobStatus,
    bytesTransferred: row.bytesTransferred,
    filesTransferred: row.filesTransferred,
    message: row.message,
  };
}

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
