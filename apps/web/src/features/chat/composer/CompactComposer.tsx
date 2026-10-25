"use client";

import type { ChatScope, FolderId } from "@avenire/contracts";
import { cn } from "@avenire/ui/lib/utils";
import { useState, type ReactNode } from "react";

import { useLibraryIndex } from "../useLibraryIndex.ts";
import { ChatComposer, type ComposerSubmission } from "./ChatComposer.tsx";
import { ControlDivider, RuthModelMenu, ScopePicker } from "./controls.tsx";

export interface CompactComposerSubmission extends ComposerSubmission {
  /** The scope for this turn: the strip's choice plus any @-mentioned notebooks and files. */
  readonly scope: ChatScope;
  readonly fast: boolean;
}

export interface CompactComposerProps {
  readonly draftKey: string;
  readonly placeholder?: string;
  /** Initial scope; e.g. `{ fileIds: [noteId] }` on a note, `{ folderIds: [id] }` in a notebook. */
  readonly scope: ChatScope;
  /** Label for the "only this file" scope, e.g. "This note". Shown while the scope is file-only. */
  readonly scopeLabel?: string;
  readonly onSubmit: (input: CompactComposerSubmission) => boolean | void | Promise<boolean | void>;
  readonly busy?: boolean;
  readonly onStop?: () => void;
  readonly tray?: ReactNode;
  readonly className?: string;
}

/** Merge @-mentions into a scope (deduplicated). */
export function scopeWith(
  scope: ChatScope,
  references: ComposerSubmission["references"],
): ChatScope {
  const folderIds = new Set<string>(scope.folderIds ?? []);
  const fileIds = new Set<string>(scope.fileIds ?? []);
  for (const reference of references)
    (reference.kind === "folder" ? folderIds : fileIds).add(reference.id);
  return {
    ...(folderIds.size ? { folderIds: [...folderIds] as FolderId[] } : {}),
    ...(fileIds.size
      ? { fileIds: [...fileIds] as NonNullable<ChatScope["fileIds"]>[number][] }
      : {}),
  };
}

/**
 * One-row composer that stacks when the text wraps (with hysteresis), with a context strip
 * under it: scope (This note / a notebook / everything) and Ruth vs Fast. For the note and
 * notebook pages.
 */
export function CompactComposer({
  draftKey,
  placeholder = "Ask Ruth about this",
  scope,
  scopeLabel = "This note",
  onSubmit,
  busy,
  onStop,
  tray,
  className,
}: CompactComposerProps) {
  const library = useLibraryIndex();
  const [folderId, setFolderId] = useState<FolderId | null>(scope.folderIds?.[0] ?? null);
  const [fast, setFast] = useState(false);
  const [activeControlMenu, setActiveControlMenu] = useState<"model" | "scope" | null>(null);
  const fileOnly = !folderId && (scope.fileIds?.length ?? 0) > 0;
  const current: ChatScope = folderId
    ? { folderIds: [folderId] }
    : fileOnly
      ? { fileIds: scope.fileIds! }
      : {};

  return (
    <ChatComposer
      variant="compact"
      draftKey={draftKey}
      placeholder={placeholder}
      {...(busy === undefined ? {} : { busy })}
      {...(onStop ? { onStop } : {})}
      tray={tray}
      {...(className ? { className } : {})}
      onSubmit={(input) =>
        onSubmit({ ...input, scope: scopeWith(current, input.references), fast })
      }
      below={
        <ContextStrip>
          <ScopePicker
            folderId={folderId}
            folders={library.folders}
            onChange={setFolderId}
            open={activeControlMenu === "scope"}
            onOpenChange={(open) => setActiveControlMenu(open ? "scope" : null)}
            {...(fileOnly || scope.fileIds?.length ? { thisNoteLabel: scopeLabel } : {})}
          />
          <ControlDivider />
          <RuthModelMenu
            fast={fast}
            onFastChange={setFast}
            open={activeControlMenu === "model"}
            onOpenChange={(open) => setActiveControlMenu(open ? "model" : null)}
          />
        </ContextStrip>
      }
    />
  );
}

/** The quiet control row under a compact composer. */
export function ContextStrip({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("flex items-center gap-0.5 px-2 pt-1.5", className)}>{children}</div>;
}
