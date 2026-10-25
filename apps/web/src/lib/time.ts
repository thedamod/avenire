const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days between `iso` and `now` (0 = today, 1 = yesterday). */
export function daysAgo(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
}

/**
 * `day`: Today / Yesterday / 2d ago (list rows on home).
 * `precise`: Just now / 5m ago / 2h ago / Yesterday / 3d ago.
 * `clock`: 5:48 AM today, Mon this week, then Oct 3.
 */
export type RelativeStyle = "day" | "precise" | "clock";

export function relativeLabel(iso: string, style: RelativeStyle = "precise", now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = daysAgo(iso, now);
  if (style === "clock") {
    if (days <= 0)
      return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
    return shortDate(date, now);
  }
  if (style === "precise" && days <= 0) {
    const elapsed = now.getTime() - date.getTime();
    if (elapsed < MINUTE) return "Just now";
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return shortDate(date, now);
}

function shortDate(date: Date, now: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "6m 12s", "48s", "1h 4m". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "18:40" or "1:02:05" for media positions. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
