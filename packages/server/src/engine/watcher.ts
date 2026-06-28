import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { IgnoreMatcher } from "./ignore.js";

export type LocalEventKind =
  | "add"
  | "change"
  | "unlink"
  | "addDir"
  | "unlinkDir";

export interface LocalEvent {
  kind: LocalEventKind;
  /** POSIX-style path relative to the hub root. */
  relPath: string;
  absPath: string;
}

/**
 * Watches the hub folder and emits normalized, debounced events with
 * hub-relative POSIX paths. Ignored paths never reach the engine.
 */
export class HubWatcher {
  private watcher: FSWatcher | null = null;

  constructor(
    private readonly hubPath: string,
    private readonly ignore: IgnoreMatcher,
    private readonly onEvent: (ev: LocalEvent) => void,
  ) {}

  start(): void {
    this.watcher = chokidar.watch(this.hubPath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      ignored: (p: string) => {
        const rel = this.toRel(p);
        return rel.length > 0 && this.ignore.ignores(rel);
      },
    });

    const forward = (kind: LocalEventKind) => (abs: string) => {
      const relPath = this.toRel(abs);
      if (!relPath) return;
      if (this.ignore.ignores(relPath)) return;
      this.onEvent({ kind, relPath, absPath: abs });
    };

    this.watcher
      .on("add", forward("add"))
      .on("change", forward("change"))
      .on("unlink", forward("unlink"))
      .on("addDir", forward("addDir"))
      .on("unlinkDir", forward("unlinkDir"));
  }

  private toRel(abs: string): string {
    const rel = path.relative(this.hubPath, abs);
    if (!rel || rel.startsWith("..")) return "";
    return rel.split(path.sep).join("/");
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }
}
