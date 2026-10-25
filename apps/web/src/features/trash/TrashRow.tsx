"use client";

import { ItemContextMenu, type ContextAction } from "~/components/app/ItemContextMenu";
import { memo } from "react";
import type { Folder, TrashEntry } from "@avenire/contracts";
import { FolderClosed, Trash2 } from "lucide-react";
import { Button } from "@avenire/ui/components/button";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@avenire/ui/components/tooltip";
import type { PresenceState } from "@avenire/ui/components/presence";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon, NotebookTag, plural } from "~/components/app";
import { useLongPress } from "~/features/library/useSelection";
import { daysLeft, daysLeftLabel, entryTitle } from "./trash-utils";

export const TrashRow = memo(function TrashRow({
  entry,
  notebook,
  now,
  selected,
  selecting,
  presence = "present",
  onToggle,
  onOpenActions,
  onRestore,
  onPurge,
  actions,
}: {
  actions: readonly ContextAction[];
  entry: TrashEntry;
  /** The notebook a trashed file belonged to, when it still exists. */
  notebook: Folder | undefined;
  now: number;
  selected: boolean;
  selecting: boolean;
  /** From `usePresenceList`: restored/purged rows collapse out, new ones open in. */
  presence?: PresenceState;
  onToggle: (entry: TrashEntry) => void;
  onOpenActions: (entry: TrashEntry) => void;
  onRestore: (entry: TrashEntry) => void;
  onPurge: (entry: TrashEntry) => void;
}) {
  const title = entryTitle(entry);
  const days = daysLeft(entry.purgeAt, now);
  const { handlers, consumeClick } = useLongPress(() => onToggle(entry));

  return (
    <li className="presence-item" data-presence={presence} inert={presence === "exit"}>
      <ItemContextMenu actions={actions}>
        <div
          tabIndex={0}
          {...handlers}
          onClick={() => {
            if (consumeClick()) return;
            if (selecting) onToggle(entry);
            else if (window.matchMedia("(pointer: coarse)").matches) onOpenActions(entry);
          }}
          data-selected={selected || undefined}
          className={cn(
            "group/row relative flex min-h-[60px] items-center gap-3 px-5 py-3 select-none md:min-h-12 md:px-4 md:py-0",
            "transition-colors md:hover:bg-surface-2 data-[selected]:bg-surface-2",
            selecting && "cursor-pointer",
          )}
        >
          <span className="relative flex size-5 shrink-0 items-center justify-center md:size-4">
            <span
              className={cn(
                "flex items-center justify-center",
                selected || selecting ? "hidden" : "md:group-hover/row:hidden",
              )}
            >
              {entry._tag === "folder" ? (
                <FolderClosed
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="size-4 text-foreground-soft"
                />
              ) : (
                <FileKindIcon kind={entry.file.kind} url={entry.file.sourceUrl} />
              )}
            </span>
            <Checkbox
              checked={selected}
              aria-label={`Select ${title}`}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={() => onToggle(entry)}
              className={cn(
                "size-5 rounded-full md:size-4 md:rounded-[4px]",
                selected || selecting ? "flex" : "hidden md:group-hover/row:flex",
              )}
            />
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
            <span className="truncate text-[15px] leading-5 font-medium md:max-w-[60%] md:text-[13.5px] md:font-normal">
              {title}
            </span>
            <span className="flex min-w-0 items-center text-xs text-muted-foreground md:text-[12.5px]">
              {entry._tag === "folder" ? (
                <span className="truncate">
                  Notebook · {plural(entry.folder.noteCount, "note")},{" "}
                  {plural(entry.folder.sourceCount, "source")}
                </span>
              ) : notebook ? (
                <NotebookTag
                  name={notebook.name}
                  color={notebook.color}
                  className="text-xs text-muted-foreground md:text-[12.5px]"
                />
              ) : null}
            </span>
          </div>

          {!selecting ? (
            <span className="hidden shrink-0 items-center gap-1 group-hover/row:flex group-focus-within/row:flex">
              <Button
                variant="secondary"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onRestore(entry);
                }}
              >
                Restore
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete forever"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPurge(entry);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete forever</TooltipContent>
              </Tooltip>
            </span>
          ) : null}

          <span
            className={cn(
              "w-[72px] shrink-0 text-right text-xs whitespace-nowrap tabular-nums md:w-[84px] md:text-[12.5px]",
              days <= 1 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {daysLeftLabel(days)}
          </span>
        </div>
      </ItemContextMenu>
    </li>
  );
});
