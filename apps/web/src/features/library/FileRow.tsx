"use client";

import Link from "next/link";
import { memo, useCallback } from "react";
import type { FileId, LibraryFile } from "@avenire/contracts";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app";
import { FileItemContextMenu } from "./FileItemContextMenu";
import type { Selection } from "./useSelection";
import { useLongPress } from "./useSelection";

export function fileHref(file: Pick<LibraryFile, "id" | "kind" | "mediaPositionSec">): string {
  if (file.kind === "note") return `/notes/${file.id}`;
  return file.mediaPositionSec
    ? `/sources/${file.id}?t=${Math.floor(file.mediaPositionSec)}`
    : `/sources/${file.id}`;
}

/**
 * One row of a file list (notes, sources). Desktop: the icon turns into a checkbox on hover or
 * while anything is selected. Touch: long-press selects; taps toggle while selecting.
 */
export const FileRow = memo(function FileRow({
  file,
  selection,
  title,
  subtitle,
  aside,
  trailing,
  below,
  actions,
  selected,
  selecting,
  onToggle,
  className,
}: {
  file: LibraryFile;
  selection: Selection;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Desktop middle column (notebook, filing link). Hidden on phone. */
  aside?: React.ReactNode;
  /** Right-most column (time, status). */
  trailing?: React.ReactNode;
  /** Non-interactive content under the title (progress, reason). */
  below?: React.ReactNode;
  /** Buttons under the row (phone "Needs you" actions). */
  actions?: React.ReactNode;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: FileId) => void;
  className?: string;
}) {
  const toggle = useCallback(() => onToggle(file.id), [onToggle, file.id]);
  const { handlers, consumeClick } = useLongPress(toggle);

  function onClick(event: React.MouseEvent) {
    if (consumeClick()) {
      event.preventDefault();
    } else if (selecting) {
      event.preventDefault();
      toggle();
    }
  }

  const row = (
    <FileItemContextMenu file={file} href={fileHref(file)} selection={selection}>
      <div
        data-selected={selected || undefined}
        className={cn(
          "group/row relative flex items-center gap-3 px-4 py-3 transition-colors select-none hover:bg-hover data-[selected]:bg-surface-3 md:gap-4 md:py-0 md:min-h-[54px]",
          className,
        )}
        {...handlers}
      >
        <div className="relative flex size-[34px] shrink-0 items-center justify-center md:size-6">
          <span
            className={cn(
              "transition-opacity md:group-hover/row:opacity-0",
              (selecting || selected) && "opacity-0",
            )}
          >
            <FileKindIcon kind={file.kind} url={file.sourceUrl} tile className="md:hidden" />
            <FileKindIcon kind={file.kind} url={file.sourceUrl} className="max-md:hidden" />
          </span>
          <Checkbox
            checked={selected}
            onCheckedChange={toggle}
            aria-label={`Select ${file.title}`}
            className={cn(
              "absolute z-10 opacity-0 transition-opacity max-md:size-[22px] max-md:rounded-full md:group-hover/row:opacity-100",
              (selecting || selected) && "opacity-100",
              !(selecting || selected) && "max-md:pointer-events-none",
            )}
          />
        </div>
        <Link
          href={fileHref(file)}
          onClick={onClick}
          draggable={false}
          className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/50 md:py-2.5"
        >
          <span
            title={file.title}
            className="min-w-0 truncate text-[15px] leading-5 font-medium md:text-[13.5px]"
          >
            {title ?? file.title}
          </span>
          {subtitle ? (
            <span className="truncate text-[13px] leading-4 text-muted-foreground md:text-[12.5px]">
              {subtitle}
            </span>
          ) : null}
          {below}
        </Link>
        {aside ? (
          <div className="relative z-10 hidden min-w-0 shrink-0 md:flex md:w-[200px]">{aside}</div>
        ) : null}
        {trailing ? (
          <div
            className={cn(
              "relative shrink-0 self-start pt-0.5 md:self-center md:pt-0",
              aside && "md:w-16 md:text-right",
            )}
          >
            {trailing}
          </div>
        ) : null}
      </div>
    </FileItemContextMenu>
  );
  if (!actions) return row;
  return (
    <div>
      {row}
      <div className="relative flex flex-wrap gap-3 px-4 pb-3 pl-[62px] md:hidden">{actions}</div>
    </div>
  );
});
