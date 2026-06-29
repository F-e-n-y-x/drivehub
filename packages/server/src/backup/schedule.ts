import type { Schedule } from "@drivehub/types";

/**
 * Compute the next run time (epoch ms) for a schedule, given "now".
 * Returns null for schedules that aren't time-driven (manual, realtime).
 * Pure function so it can be unit-tested without timers.
 */
export function computeNextRun(schedule: Schedule, now: number): number | null {
  switch (schedule.kind) {
    case "manual":
    case "realtime":
      return null;
    case "interval": {
      const mins = Math.max(1, schedule.intervalMinutes ?? 60);
      return now + mins * 60_000;
    }
    case "daily": {
      return nextTimeOfDay(schedule.timeOfDay ?? "03:00", now);
    }
    case "weekly": {
      const target = nextTimeOfDay(schedule.timeOfDay ?? "03:00", now);
      const weekday = schedule.weekday ?? 0;
      const d = new Date(target);
      const diff = (weekday - d.getDay() + 7) % 7;
      return target + diff * 86_400_000;
    }
    default:
      return null;
  }
}

/** Next occurrence of HH:MM strictly after `now` (today or tomorrow). */
function nextTimeOfDay(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  let t = d.getTime();
  if (t <= now) t += 86_400_000;
  return t;
}

/** Format a Date into the snapshot archive timestamp, e.g. 2026-06-29-1432. */
export function archiveStamp(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}-${h}${mi}`;
}
