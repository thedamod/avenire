"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, CircleAlert, Loader2, Minus } from "lucide-react";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app";
import { PresenceRows } from "~/features/library/PresenceRows";
import { fileHref } from "~/features/library/FileRow";
import { formatTimestamp } from "~/lib/time";
import { CaptureShortcutKeys } from "./CaptureShortcutKeys";
import {
  getLiveCapture,
  subscribeLiveCaptures,
  type CaptureRow,
  type CaptureRowStatus,
} from "./liveCapture";

const rowKey = (row: CaptureRow) => row.key;

/**
 * 13a: what the capture shortcut is doing. Opens the moment the hotkey fires with every item
 * pending, fills in as each one is read and saved, then settles with Undo and a way to Sources.
 */
export function CaptureToast({
  captureId,
  onUndo,
  onOpen,
}: {
  captureId: string;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const live = useSyncExternalStore(
    subscribeLiveCaptures,
    () => getLiveCapture(captureId),
    () => undefined,
  );
  const rows = live?.rows ?? [];
  const settled = !!live?.receipt;
  const saved = rows.filter((row) => row.status === "saved").length;
  const things = (count: number) => `${count} thing${count === 1 ? "" : "s"}`;
  const heading = settled
    ? saved
      ? `Captured ${things(saved)}`
      : "Nothing captured"
    : `Capturing ${things(rows.length)}…`;
  return (
    <div className="w-[min(358px,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-sheet-border bg-[#131313] text-foreground">
      <div className="flex h-11 items-center gap-2 px-3.5">
        <CaptureShortcutKeys />
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {heading}
        </span>
        {settled && live.receipt?.files.length ? (
          <button
            type="button"
            onClick={onUndo}
            className="motion-press h-7 shrink-0 rounded-[7px] bg-surface-4 px-2.5 text-[12.5px] font-semibold hover:bg-surface-5"
          >
            Undo
          </button>
        ) : null}
      </div>
      {rows.length ? (
        <ScrollFade className="max-h-[min(300px,45dvh)] overflow-y-auto px-2 pb-1.5">
          <PresenceRows items={rows} getKey={rowKey}>
            {(row) => <Row row={row} onOpen={onOpen} />}
          </PresenceRows>
        </ScrollFade>
      ) : null}
      <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">In Sources · Unfiled. Ruth can sort them tonight.</span>
        <Link
          href="/?tab=sources&filter=unfiled"
          onClick={onOpen}
          className="font-medium text-foreground-soft transition-colors hover:text-foreground"
        >
          Sources
        </Link>
      </div>
    </div>
  );
}

function Row({ row, onOpen }: { row: CaptureRow; onOpen: () => void }) {
  const position = row.file?.mediaPositionSec;
  const line = (
    <>
      <FileKindIcon kind={row.kind} url={row.file?.sourceUrl ?? null} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          (row.status === "skipped" || row.status === "failed") && "text-foreground-soft",
        )}
      >
        {row.title}
      </span>
      {row.file ? (
        <span className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100">
          Open
        </span>
      ) : null}
      {position ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          at {formatTimestamp(position)}
        </span>
      ) : null}
      <StatusGlyph status={row.status} />
    </>
  );
  return (
    <div className="flex flex-col py-0.5">
      {row.file ? (
        <Link
          href={fileHref(row.file)}
          onClick={onOpen}
          className="group flex h-8 items-center gap-3 rounded-md px-1.5 text-[13px] outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
        >
          {line}
        </Link>
      ) : (
        <div className="flex h-8 items-center gap-3 px-1.5 text-[13px]">{line}</div>
      )}
      {row.reason ? (
        <p
          key={row.reason}
          className={cn(
            "enter-fade -mt-1 pr-1.5 pb-1 pl-[34px] text-xs leading-4",
            row.status === "failed" ? "text-destructive/85" : "text-muted-foreground",
          )}
        >
          {row.reason}
        </p>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<CaptureRowStatus, string> = {
  pending: "Waiting",
  uploading: "Saving",
  saved: "Saved",
  skipped: "Skipped",
  failed: "Failed",
};

/** Spinner while it's in flight, then a glyph that fades and settles in (no layout shift). */
function StatusGlyph({ status }: { status: CaptureRowStatus }) {
  const glyph = "size-3.5";
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      className="grid size-4 shrink-0 place-items-center"
    >
      <span
        key={status === "pending" || status === "uploading" ? "busy" : status}
        className="col-start-1 row-start-1 grid place-items-center transition-[opacity,scale] duration-popover ease-out starting:scale-90 starting:opacity-0 motion-reduce:starting:scale-100"
      >
        {status === "saved" ? (
          <Check className={cn(glyph, "text-foreground-soft")} aria-hidden="true" />
        ) : status === "skipped" ? (
          <Minus className={cn(glyph, "text-muted-foreground")} aria-hidden="true" />
        ) : status === "failed" ? (
          <CircleAlert className={cn(glyph, "text-destructive/85")} aria-hidden="true" />
        ) : (
          <Loader2
            className={cn(
              glyph,
              "animate-spin text-muted-foreground transition-opacity motion-reduce:animate-none",
              status === "pending" && "opacity-50",
            )}
            aria-hidden="true"
          />
        )}
      </span>
    </span>
  );
}
