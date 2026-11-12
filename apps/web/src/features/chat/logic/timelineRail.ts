import type { ChatRow } from "./types.ts";

export interface TimelineRailItem {
  readonly id: string;
  /** -1 is the report introduction, before the virtualised rows. */
  readonly rowIndex: number;
  readonly title: string;
  readonly preview: string | null;
}

/** Chat uses user turns; reports also index the run's sections before the follow-up chat. */
export function timelineRailItems(rows: readonly ChatRow[], report: boolean): TimelineRailItem[] {
  const items: TimelineRailItem[] = report
    ? [{ id: "report-intro", rowIndex: -1, title: "Morning report", preview: null }]
    : [];
  let inFollowUp = !report;
  let turn: TimelineRailItem | undefined;
  for (const [rowIndex, row] of rows.entries()) {
    if (row.kind === "user") {
      inFollowUp = true;
      turn = { id: row.id, rowIndex, title: row.text || "Attached files", preview: null };
      items.push(turn);
    } else if (row.kind === "prose") {
      if (inFollowUp) {
        if (turn) {
          turn = { ...turn, preview: row.text };
          items[items.length - 1] = turn;
        }
      } else {
        const heading = row.text.match(/^#{1,6}\s+(.+)$/m)?.[1];
        const firstLine = row.text.split("\n").find((line) => line.trim());
        items.push({
          id: row.id,
          rowIndex,
          title: heading ?? firstLine ?? "Report",
          preview: row.text,
        });
      }
    } else if (!inFollowUp && row.kind === "work") {
      items.push({
        id: row.id,
        rowIndex,
        title: "Ava’s activity",
        preview: row.entries.map((entry) => entry.label).join(" · "),
      });
    } else if (!inFollowUp && row.kind === "media") {
      items.push({
        id: row.id,
        rowIndex,
        title: row.items[0]?.title ?? "Figures and files",
        preview: null,
      });
    }
  }
  return items;
}

export function currentRailItem(
  items: readonly TimelineRailItem[],
  rowIndex: number,
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]!.rowIndex <= rowIndex) return items[i]!.id;
  }
  return items[0]?.id ?? null;
}

export function railIndexAtPointer(y: number, top: number, height: number, count: number): number {
  if (count < 2 || height <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(((y - top) / height) * (count - 1))));
}
