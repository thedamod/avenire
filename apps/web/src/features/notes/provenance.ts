import type { LibraryFile } from "@avenire/contracts";

/** True for notes Ruth wrote (in chat or overnight); their provenance line is periwinkle. */
export function writtenByRuth(note: Pick<LibraryFile, "source">): boolean {
  return note.source === "ruth" || note.source === "ruth-cloud";
}

/** "Written by Ruth", "Saved from a chat", "Your note" (07 / M09 tiles). */
export function noteProvenance(note: Pick<LibraryFile, "source">): string {
  if (writtenByRuth(note)) return "Written by Ava";
  if (note.source === "chat") return "Saved from a chat";
  return "Your note";
}

/** Distinct sources a note's markdown links to (`/sources/<id>` citations). */
export function citedSourceCount(markdown: string): number {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(/\/sources\/([A-Za-z0-9_-]+)/g)) ids.add(match[1]!);
  return ids.size;
}
