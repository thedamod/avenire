import type { Folder, LibraryFile } from "@avenire/contracts";

export interface ComposerReference {
  readonly kind: "file" | "folder";
  readonly id: string;
  readonly label: string;
}

export interface Trigger {
  readonly kind: "mention" | "command";
  readonly query: string;
  /** Index of the `@` or `/` in the text. */
  readonly start: number;
}

/** The `@query` (anywhere) or `/command` (at the start) the caret is in, if any. */
export function activeTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const mention = /(^|\s)@([^\s@]{0,40})$/.exec(before);
  if (mention)
    return { kind: "mention", query: mention[2]!, start: caret - mention[2]!.length - 1 };
  const command = /^\/([a-z]{0,20})$/i.exec(before);
  if (command) return { kind: "command", query: command[1]!, start: 0 };
  return null;
}

export const COMMANDS = [
  {
    id: "explain",
    label: "/explain",
    detail: "Explain a concept from your material",
    text: "Explain ",
  },
  { id: "quiz", label: "/quiz", detail: "Quiz me with a few questions", text: "Quiz me on " },
  {
    id: "flashcards",
    label: "/flashcards",
    detail: "Make flashcards",
    text: "Make flashcards for ",
  },
  {
    id: "summarize",
    label: "/summarize",
    detail: "Summarise a source or notebook",
    text: "Summarise ",
  },
] as const;

export type MenuItem =
  | { readonly type: "folder"; readonly folder: Folder }
  | { readonly type: "file"; readonly file: LibraryFile }
  | { readonly type: "command"; readonly command: (typeof COMMANDS)[number] };

export function menuItems(
  trigger: Trigger,
  folders: readonly Folder[],
  files: readonly LibraryFile[],
): MenuItem[] {
  const query = trigger.query.toLowerCase();
  if (trigger.kind === "command")
    return COMMANDS.filter((command) => command.id.startsWith(query)).map((command) => ({
      type: "command",
      command,
    }));
  const match = (title: string) => title.toLowerCase().includes(query);
  return [
    ...folders
      .filter((folder) => match(folder.name))
      .slice(0, 4)
      .map((folder): MenuItem => ({ type: "folder", folder })),
    ...files
      .filter((file) => match(file.title))
      .slice(0, 8)
      .map((file): MenuItem => ({ type: "file", file })),
  ].slice(0, 8);
}

/** References whose `@label` still appears in the text (deleting the token drops it). */
export function liveReferences(
  text: string,
  references: readonly ComposerReference[],
): ComposerReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (seen.has(reference.id) || !text.includes(`@${reference.label}`)) return false;
    seen.add(reference.id);
    return true;
  });
}
