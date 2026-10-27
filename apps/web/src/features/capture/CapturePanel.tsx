"use client";

import type { PointerEventHandler, ReactNode } from "react";
import type { LibraryFile } from "@avenire/contracts";
import { Check, CircleAlert, Loader2, Minus } from "lucide-react";
import { usePresenceList } from "@avenire/ui/components/presence";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app/FileKindIcon";
import { PresenceRows } from "~/features/library/PresenceRows";
import { formatTimestamp } from "~/lib/time";
import {
  captureHeading,
  type CapturePhase,
  type CaptureRow,
  type CaptureRowStatus,
} from "./liveCapture";

/**
 * Where a panel link goes. The in-app toast renders Next links; the desktop overlay (a bundled
 * page with no router) renders buttons that ask the main process instead.
 */
export type CaptureLinkTarget =
  | { readonly type: "file"; readonly file: LibraryFile }
  | { readonly type: "sources" };
export type RenderCaptureLink = (
  target: CaptureLinkTarget,
  props: { readonly className: string; readonly children: ReactNode },
) => ReactNode;

const rowKey = (row: CaptureRow) => row.key;

/**
 * 13a: what the capture shortcut is doing. Opens the moment the hotkey fires with every item
 * pending, fills in as each one is read and saved, then settles with Undo and a way to Sources.
 * Shared by the in-app toast and the global desktop overlay, so it stays free of Next imports.
 */
export function CapturePanel({
  rows,
  phase,
  error,
  keys,
  onUndo,
  renderLink,
  favicons = true,
  listClassName = "max-h-[min(300px,45dvh)]",
  className,
  onPointerEnter,
  onPointerLeave,
}: {
  rows: readonly CaptureRow[];
  phase: CapturePhase;
  /** The submit error, shown under the header when `phase` is failed. */
  error?: string | undefined;
  /** Shortcut keycaps for the header. */
  keys?: ReactNode;
  /** Shown once done, when there is something to take back. */
  onUndo?: (() => void) | undefined;
  renderLink: RenderCaptureLink;
  /** Remote favicons for web rows; off where the CSP allows only bundled images. */
  favicons?: boolean;
  listClassName?: string;
  className?: string;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
}) {
  const settled = phase !== "capturing";
  const saved = rows.some((row) => row.status === "saved");
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-sheet-border bg-[#131313] text-foreground",
        className,
      )}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex h-11 items-center gap-2 px-3.5">
        {keys}
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {captureHeading(rows, phase)}
        </span>
        {phase === "done" && onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            className="motion-press enter-fade h-7 shrink-0 rounded-[7px] bg-surface-4 px-2.5 text-[12.5px] font-semibold hover:bg-surface-5"
          >
            Undo
          </button>
        ) : null}
      </div>
      {phase === "failed" ? (
        <p className="enter-fade -mt-1.5 px-3.5 pb-2.5 text-xs leading-4 text-muted-foreground">
          {error ? <span className="text-destructive/85">{error}. </span> : null}
          Press the capture shortcut to retry.
        </p>
      ) : null}
      {rows.length ? (
        <ScrollFade className={cn("overflow-y-auto px-2 pb-1.5", listClassName)}>
          <PresenceRows items={rows} getKey={rowKey}>
            {(row) => (
              <Row row={row} settled={settled} favicons={favicons} renderLink={renderLink} />
            )}
          </PresenceRows>
        </ScrollFade>
      ) : null}
      {phase !== "failed" || saved ? (
        <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">In Sources · Unfiled. Ruth can sort them tonight.</span>
          {renderLink(
            { type: "sources" },
            {
              className: "font-medium text-foreground-soft transition-colors hover:text-foreground",
              children: "Sources",
            },
          )}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  row,
  settled,
  favicons,
  renderLink,
}: {
  row: CaptureRow;
  settled: boolean;
  favicons: boolean;
  renderLink: RenderCaptureLink;
}) {
  const position = row.file?.mediaPositionSec;
  const line = (
    <>
      <FileKindIcon kind={row.kind} url={favicons ? (row.file?.sourceUrl ?? null) : null} />
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
      <StatusGlyph status={row.status} settled={settled} />
    </>
  );
  return (
    <div className="flex flex-col py-0.5">
      {row.file ? (
        renderLink(
          { type: "file", file: row.file },
          {
            className:
              "group flex h-8 w-full items-center gap-3 rounded-md px-1.5 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:bg-hover",
            children: line,
          },
        )
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

type Glyph = "busy" | "saved" | "skipped" | "failed";
const glyphKey = (glyph: Glyph) => glyph;

/**
 * Spinner while it's in flight, then the glyph cross-fades to the result (both stacked in one
 * cell, so no layout shift). Once the capture settled, anything still in flight never will be:
 * it shows as not captured instead of spinning on.
 */
function StatusGlyph({ status, settled }: { status: CaptureRowStatus; settled: boolean }) {
  const busy = status === "pending" || status === "uploading";
  const glyph: Glyph = busy ? (settled ? "skipped" : "busy") : status;
  const layers = usePresenceList([glyph], glyphKey, 150);
  const size = "size-3.5";
  return (
    <span
      role="img"
      aria-label={busy && settled ? "Not captured" : STATUS_LABEL[status]}
      className="grid size-4 shrink-0 place-items-center"
    >
      {layers.map(({ key, item, state }) => (
        <span
          key={key}
          className={cn(
            "col-start-1 row-start-1 grid place-items-center transition-[opacity,scale] ease-out starting:scale-90 starting:opacity-0 motion-reduce:starting:scale-100",
            // Exits faster than it enters.
            state === "exit" ? "opacity-0 duration-fast" : "duration-popover",
          )}
        >
          {item === "saved" ? (
            <Check className={cn(size, "text-foreground-soft")} aria-hidden="true" />
          ) : item === "skipped" ? (
            <Minus className={cn(size, "text-muted-foreground")} aria-hidden="true" />
          ) : item === "failed" ? (
            <CircleAlert className={cn(size, "text-destructive/85")} aria-hidden="true" />
          ) : (
            <Loader2
              className={cn(
                size,
                "animate-spin text-muted-foreground transition-opacity motion-reduce:animate-none",
                status === "pending" && "opacity-50",
              )}
              aria-hidden="true"
            />
          )}
        </span>
      ))}
    </span>
  );
}
