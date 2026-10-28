"use client";

import { useState, type PointerEventHandler, type ReactNode } from "react";
import type { LibraryFile } from "@avenire/contracts";
import { CircleAlert, Loader2, Minus, Undo2, X } from "lucide-react";
import { ScrollFade, useScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import { FileKindIcon } from "~/components/app/FileKindIcon";
import { PresenceRows } from "~/features/library/PresenceRows";
import { formatTimestamp } from "~/lib/time";
import "./CapturePanel.css";
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
 * pending, fills in as each one is read and saved, then settles with an undo action on each saved row.
 * Shared by the in-app toast and the global desktop overlay, so it stays free of Next imports.
 */
export function CapturePanel({
  rows,
  phase,
  error,
  keys,
  onUndo,
  onDismiss,
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
  /** Each saved source can be undone independently, even while others are uploading. */
  onUndo?: ((fileId: string) => Promise<void>) | undefined;
  onDismiss?: (() => void) | undefined;
  renderLink: RenderCaptureLink;
  /** Remote favicons for web rows; off where the CSP allows only bundled images. */
  favicons?: boolean;
  /** The list is what gives way (and scrolls) when the panel's height is capped. */
  listClassName?: string;
  className?: string;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
}) {
  const settled = phase !== "capturing";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-sheet-border bg-[#131313] text-foreground",
        className,
      )}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 px-3.5">
        {keys ? <span className="flex shrink-0">{keys}</span> : null}
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
          {captureHeading(rows, phase)}
        </span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss capture"
            title="Dismiss"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {phase === "failed" ? (
        <p className="enter-fade -mt-1.5 shrink-0 px-3.5 pb-2.5 text-xs leading-4 text-muted-foreground">
          {error ? <span className="text-destructive/85">{error}. </span> : null}
          Press the capture shortcut to retry.
        </p>
      ) : null}
      {rows.length ? (
        <ScrollFade
          className={cn("min-w-0 overflow-x-hidden overflow-y-auto px-2 pb-1.5", listClassName)}
        >
          <PresenceRows items={rows} getKey={rowKey}>
            {(row) => (
              <Row
                row={row}
                settled={settled}
                favicons={favicons}
                renderLink={renderLink}
                onUndo={onUndo}
              />
            )}
          </PresenceRows>
        </ScrollFade>
      ) : null}
    </div>
  );
}

function Row({
  row,
  settled,
  favicons,
  renderLink,
  onUndo,
}: {
  row: CaptureRow;
  settled: boolean;
  favicons: boolean;
  renderLink: RenderCaptureLink;
  onUndo?: ((fileId: string) => Promise<void>) | undefined;
}) {
  const fade = useScrollFade<HTMLSpanElement>("x");
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string>();
  const undo = async () => {
    if (!row.file || !onUndo || undoing) return;
    setUndoing(true);
    setUndoError(undefined);
    try {
      await onUndo(row.file.id);
    } catch {
      setUndoError("Couldn't undo. Try again.");
    } finally {
      setUndoing(false);
    }
  };
  const position = row.file?.mediaPositionSec;
  const line = (
    <>
      <span className="shrink-0">
        <FileKindIcon kind={row.kind} url={favicons ? (row.file?.sourceUrl ?? null) : null} />
      </span>
      <span
        key={row.title}
        ref={fade}
        title={row.title}
        className={cn(
          "edge-fade-x block min-w-0 flex-1 overflow-hidden whitespace-nowrap [--edge-fade-size:16px]",
          (row.status === "skipped" || row.status === "failed") && "text-foreground-soft",
        )}
      >
        {row.title}
      </span>
      {position ? (
        <span className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(position)}</span>
      ) : null}
    </>
  );
  const reason = undoError ?? row.reason;
  return (
    <div className="min-w-0 overflow-hidden py-0.5">
      <div className="flex min-w-0 items-center gap-1 pr-1.5">
        {row.file ? (
          renderLink(
            { type: "file", file: row.file },
            {
              className:
                "group flex h-8 min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-md px-1.5 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring",
              children: line,
            },
          )
        ) : (
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2.5 overflow-hidden px-1.5 text-[13px]">
            {line}
          </div>
        )}
        <div className="flex w-[44px] shrink-0 items-center justify-end gap-1">
          {row.status === "saved" && row.file && onUndo ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={undoing}
              aria-label={`Undo capture of ${row.title}`}
              title="Undo capture"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              {undoing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : null}
          <StatusGlyph status={row.status} settled={settled} />
        </div>
      </div>
      {row.status === "uploading" && row.stage ? (
        <p className="-mt-1 min-w-0 pr-1.5 pb-1 pl-[30px] text-xs leading-4 text-muted-foreground">
          {row.stage === "preparing"
            ? "Preparing"
            : row.stage === "validating"
              ? "Verifying upload"
              : row.totalBytes
                ? `Uploading ${Math.floor(Math.min(1, (row.loadedBytes ?? 0) / row.totalBytes) * 100)}%`
                : "Uploading"}
        </p>
      ) : null}
      {reason ? (
        <p
          className={cn(
            "enter-fade -mt-1 min-w-0 break-words pr-1.5 pb-1 pl-[30px] text-xs leading-4",
            row.status === "failed" || undoError ? "text-destructive/85" : "text-muted-foreground",
          )}
        >
          {reason}
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
// Mirrors CapturePanel.css: four cubic curves each, so `d` can interpolate between them.
const RING_PATH =
  "M12 3 C16.97 3 21 7.03 21 12 C21 16.97 16.97 21 12 21 C7.03 21 3 16.97 3 12 C3 7.03 7.03 3 12 3";
const TICK_PATH =
  "M5 12 C5.7 12.7 6.3 13.3 7 14 C7.7 14.7 8.3 15.3 9 16 C10.7 14.3 12.3 12.7 14 11 C15.7 9.3 17.3 7.7 19 6";
/** The spinner and tick share one path, so completion changes its shape in place. */
function StatusGlyph({ status, settled }: { status: CaptureRowStatus; settled: boolean }) {
  const busy = status === "pending" || status === "uploading";
  const glyph: Glyph = busy ? (settled ? "skipped" : "busy") : status;
  return (
    <span
      role="img"
      aria-label={busy && settled ? "Not captured" : STATUS_LABEL[status]}
      data-status={glyph}
      className="capture-status grid size-4 shrink-0 place-items-center"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn(
          "capture-status-morph col-start-1 row-start-1 size-3.5",
          glyph === "saved" ? "text-success" : "text-muted-foreground",
          status === "pending" && "opacity-50",
        )}
      >
        {/* Engines without the CSS `d` property (Safari) swap shapes instead of morphing. */}
        <path
          className="capture-status-stroke"
          pathLength="1"
          d={glyph === "saved" ? TICK_PATH : RING_PATH}
        />
      </svg>
      {glyph === "failed" ? (
        <CircleAlert
          className="capture-status-failure col-start-1 row-start-1 size-3.5 text-destructive"
          aria-hidden="true"
        />
      ) : glyph === "skipped" ? (
        <Minus
          className="capture-status-failure col-start-1 row-start-1 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}
