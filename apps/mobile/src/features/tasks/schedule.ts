import type { CloudTask, CloudTaskSchedule, FolderId, HydrationRule } from "@avenire/contracts";

export type Repeat = "tonight" | "nightly" | "weeknights";

/** Runs start this long before the "ready by" time the user picks. */
const LEAD_MINUTES = 120;

export const READY_TIMES = Array.from({ length: 11 }, (_, index) => {
  const minutes = 5 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function shift(hhmm: string, delta: number): { h: number; m: number } {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return { h: Math.floor(total / 60), m: total % 60 };
}

export function toSchedule(repeat: Repeat, readyBy: string, now = new Date()): CloudTaskSchedule {
  const start = shift(readyBy, -LEAD_MINUTES);
  if (repeat === "tonight") {
    const at = new Date(now);
    at.setHours(start.h, start.m, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
    return { _tag: "once", at: at.toISOString() };
  }
  return {
    _tag: "cron",
    expression: `${start.m} ${start.h} * * ${repeat === "weeknights" ? "1-5" : "*"}`,
  };
}

export function fromSchedule(schedule: CloudTaskSchedule): { repeat: Repeat; readyBy: string } {
  if (schedule._tag === "once") {
    const at = new Date(schedule.at);
    const { h, m } = shift(`${at.getHours()}:${at.getMinutes()}`, LEAD_MINUTES);
    return {
      repeat: "tonight",
      readyBy: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    };
  }
  const [m = "0", h = "5", , , dow = "*"] = schedule.expression.split(/\s+/);
  const ready = shift(`${Number(h) || 0}:${Number(m) || 0}`, LEAD_MINUTES);
  return {
    repeat: dow === "1-5" ? "weeknights" : "nightly",
    readyBy: `${String(ready.h).padStart(2, "0")}:${String(ready.m).padStart(2, "0")}`,
  };
}

const REPEAT_LABELS: Record<Repeat, string> = {
  tonight: "Tonight only",
  nightly: "Every night",
  weeknights: "Weeknights",
};

export function repeatLabel(repeat: Repeat) {
  return REPEAT_LABELS[repeat];
}

/** "Weeknights · ready by 7:00 AM". Unknown cron expressions are shown as they are. */
export function describeSchedule(schedule: CloudTaskSchedule): string {
  if (schedule._tag === "cron" && !/^\d+ \d+ \* \* (\*|1-5)$/.test(schedule.expression.trim()))
    return `Custom · ${schedule.expression}`;
  const { repeat, readyBy } = fromSchedule(schedule);
  return `${REPEAT_LABELS[repeat]} · ready by ${formatClock(readyBy)}`;
}

/** Notebooks and "today's captures" ↔ hydration rules. */
export function toRules(folderIds: readonly FolderId[], todaysCaptures: boolean): HydrationRule[] {
  const rules: HydrationRule[] = [];
  if (folderIds.length) rules.push({ selector: { filters: { folderIds: [...folderIds] } } });
  if (todaysCaptures)
    rules.push({ selector: { time: { today: true, events: ["captured", "uploaded"] } } });
  return rules;
}

export function fromRules(rules: readonly HydrationRule[]) {
  const folderIds = new Set<FolderId>();
  let todaysCaptures = false;
  for (const { selector } of rules) {
    for (const id of selector.filters?.folderIds ?? []) folderIds.add(id);
    for (const id of selector.explicit?.folderIds ?? []) folderIds.add(id);
    if (selector.time?.today) todaysCaptures = true;
  }
  return { folderIds: [...folderIds], todaysCaptures };
}

export function nextRunLabel(task: CloudTask): string | null {
  if (!task.enabled) return "Paused";
  if (!task.nextRunAt) return null;
  const next = new Date(task.nextRunAt);
  const hoursAway = (next.getTime() - Date.now()) / 3_600_000;
  if (hoursAway < 18) return "Tonight";
  if (hoursAway < 42) return "Tomorrow night";
  return next.toLocaleDateString(undefined, { weekday: "short" });
}
