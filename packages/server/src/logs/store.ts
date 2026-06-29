import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import type { LogEntry, LogLevel } from "@drivehub/types";

const LEVEL_NAMES: Record<number, LogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const MAX_ENTRIES = 2000;
const RESERVED = new Set(["level", "time", "msg", "pid", "hostname", "name", "v"]);

/**
 * In-memory ring buffer of recent log lines plus a pub/sub for live tailing.
 * Fed by a pino stream (see logger.ts) so the web UI can show exactly what the
 * app logs to the container's stdout.
 */
class LogStore {
  private readonly buffer: LogEntry[] = [];
  private readonly emitter = new EventEmitter();
  private seq = 0;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  push(entry: Omit<LogEntry, "id">): void {
    const full: LogEntry = { id: ++this.seq, ...entry };
    this.buffer.push(full);
    if (this.buffer.length > MAX_ENTRIES) this.buffer.shift();
    this.emitter.emit("log", full);
  }

  recent(limit = 500): LogEntry[] {
    return this.buffer.slice(-limit);
  }

  asText(): string {
    return this.buffer
      .map((e) => {
        const t = new Date(e.time).toISOString();
        return `${t} ${e.level.toUpperCase().padEnd(5)} ${e.msg}${e.context ? " " + e.context : ""}`;
      })
      .join("\n");
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.emitter.on("log", listener);
    return () => this.emitter.off("log", listener);
  }
}

export const logStore = new LogStore();

/** A pino destination stream that parses JSON log lines into the store. */
export function createLogCaptureStream(): Writable {
  let tail = "";
  return new Writable({
    write(chunk, _enc, cb) {
      tail += chunk.toString();
      let nl: number;
      while ((nl = tail.indexOf("\n")) >= 0) {
        const line = tail.slice(0, nl);
        tail = tail.slice(nl + 1);
        if (line.trim()) ingest(line);
      }
      cb();
    },
  });
}

function ingest(line: string): void {
  try {
    const obj = JSON.parse(line) as Record<string, unknown>;
    const level = LEVEL_NAMES[Number(obj.level)] ?? "info";
    const context = Object.entries(obj)
      .filter(([k]) => !RESERVED.has(k))
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" ");
    logStore.push({
      time: typeof obj.time === "number" ? obj.time : Date.now(),
      level,
      msg: typeof obj.msg === "string" ? obj.msg : "",
      context: context || undefined,
    });
  } catch {
    // Non-JSON line (shouldn't happen with pino JSON mode) — store as-is.
    logStore.push({ time: Date.now(), level: "info", msg: line });
  }
}
