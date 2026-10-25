import type { TrashEntry, TrashRef } from "@avenire/contracts";

const DAY = 86_400_000;

export function entryKey(entry: TrashEntry): string {
  return entry._tag === "file" ? `file:${entry.file.id}` : `folder:${entry.folder.id}`;
}

export function entryRef(entry: TrashEntry): TrashRef {
  return entry._tag === "file"
    ? { _tag: "file", id: entry.file.id }
    : { _tag: "folder", id: entry.folder.id };
}

export function entryTitle(entry: TrashEntry): string {
  return entry._tag === "file" ? entry.file.title : entry.folder.name;
}

export function entryHref(entry: TrashEntry): string {
  if (entry._tag === "folder") return `/notebooks/${entry.folder.id}`;
  return entry.file.kind === "note" ? `/notes/${entry.file.id}` : `/sources/${entry.file.id}`;
}

/** Whole days until the entry is deleted for good, never below 0. */
export function daysLeft(purgeAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now) / DAY));
}

export function daysLeftLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}
