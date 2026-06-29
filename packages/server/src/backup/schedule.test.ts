import { describe, expect, it } from "vitest";
import { archiveStamp, computeNextRun } from "./schedule.js";

describe("computeNextRun()", () => {
  const now = Date.UTC(2026, 5, 29, 10, 0, 0); // 2026-06-29 10:00 UTC

  it("returns null for manual and realtime", () => {
    expect(computeNextRun({ kind: "manual" }, now)).toBeNull();
    expect(computeNextRun({ kind: "realtime" }, now)).toBeNull();
  });

  it("adds the interval for interval schedules", () => {
    const next = computeNextRun({ kind: "interval", intervalMinutes: 30 }, now);
    expect(next).toBe(now + 30 * 60_000);
  });

  it("defaults interval to 60m when unspecified", () => {
    const next = computeNextRun({ kind: "interval" }, now);
    expect(next).toBe(now + 60 * 60_000);
  });

  it("schedules a future time for daily", () => {
    const next = computeNextRun({ kind: "daily", timeOfDay: "03:00" }, now);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(now);
  });
});

describe("archiveStamp()", () => {
  it("formats as YYYY-MM-DD-HHmm", () => {
    const d = new Date(2026, 5, 29, 14, 32);
    expect(archiveStamp(d)).toBe("2026-06-29-1432");
  });
});
