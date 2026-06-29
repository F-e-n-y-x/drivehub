import pino from "pino";
import pretty from "pino-pretty";
import type { LogLevel } from "@drivehub/types";
import { createLogCaptureStream } from "./logs/store.js";

const level = process.env.LOG_LEVEL ?? "info";
const isDev = (process.env.NODE_ENV ?? "development") !== "production";

// Tee logs to (a) the terminal/container stdout and (b) an in-memory store the
// web UI can tail. Both receive the same pino ndjson; pino-pretty formats the
// terminal copy in dev, and the capture stream parses the JSON for the store.
const terminal = isDev
  ? pretty({ colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" })
  : process.stdout;

// Per-stream level "trace" so neither stream drops below-info lines on its own:
// the single `logger.level` gate (changeable at runtime via Settings) decides
// what's emitted, and both the terminal and the in-memory capture see all of it.
export const logger = pino(
  { level },
  pino.multistream([
    { stream: terminal, level: "trace" },
    { stream: createLogCaptureStream(), level: "trace" },
  ]),
);

export type Logger = typeof logger;

/** Change the active log level at runtime (Settings → Developer). */
export function setLogLevel(next: LogLevel): void {
  logger.level = next;
}

export function getLogLevel(): string {
  return logger.level;
}
