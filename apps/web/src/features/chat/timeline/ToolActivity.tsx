"use client";

import { cn } from "@avenire/ui/lib/utils";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { memo, useId, useMemo, useState } from "react";
import { activitySummary, groupWorkEntries } from "../logic/workGroups.ts";
import type { WorkCall, WorkEntry } from "../logic/types.ts";

// Adapted from the reference rolling-tool-activity.tsx: 22px rows, three-row
// rolling window, fading leading edge, and a completed exploration accordion.
const ROW_HEIGHT = 22;
const VISIBLE_ROWS = 3;

export function ToolActivity({ entries }: { readonly entries: readonly WorkEntry[] }) {
  const groups = useMemo(() => groupWorkEntries(entries), [entries]);
  if (!groups.length) return null;
  return (
    <ul aria-label="Tool activity" className="flex min-w-0 flex-col">
      {groups.map((entry) => (
        <ActivityLine key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

const ActivityLine = memo(function ActivityLine({ entry }: { readonly entry: WorkEntry }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const running = entry.status === "running";
  const summary = activitySummary(entry);
  const header = (
    <>
      <span
        className={cn(
          "min-w-0 truncate",
          entry.status === "error"
            ? "text-xs font-normal text-muted-foreground"
            : "text-sm font-semibold",
          running && "ruth-shimmer",
        )}
      >
        {entry.label}
      </span>
      {summary ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{summary}</span>
      ) : null}
      {running ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-3 shrink-0 animate-spin text-muted-foreground"
        />
      ) : (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      )}
    </>
  );
  return (
    <li className="min-w-0 py-0.5">
      {running ? (
        <div role="status" className="flex h-7 min-w-0 items-center gap-2 text-foreground-soft">
          {header}
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex h-7 w-full min-w-0 items-center gap-2 text-left text-foreground-soft transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {header}
        </button>
      )}
      {running ? <RollingWindow calls={entry.calls} /> : null}
      <div
        id={panelId}
        aria-hidden={running || !open}
        style={{ gridTemplateRows: !running && open ? "1fr" : "0fr" }}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none",
          !running && open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="mt-1 mb-2 ml-1 flex min-w-0 flex-col gap-2 border-l border-border pl-3">
            {entry.calls.map((call) => (
              <li key={call.id} className="min-w-0 text-xs leading-5 text-foreground-soft">
                <div className="break-words">{call.label}</div>
                {call.detail ? (
                  <p className="mt-0.5 text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                    {call.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
});

function RollingWindow({ calls }: { readonly calls: readonly WorkCall[] }) {
  const targetY = -Math.max(0, calls.length - VISIBLE_ROWS) * ROW_HEIGHT;
  const height = Math.min(VISIBLE_ROWS, calls.length) * ROW_HEIGHT;
  const mask =
    calls.length > VISIBLE_ROWS
      ? "linear-gradient(to bottom, transparent, black 22px, black)"
      : undefined;
  return (
    <div
      aria-hidden="true"
      className="relative mt-[3px] overflow-hidden"
      style={{ height, maskImage: mask, WebkitMaskImage: mask }}
    >
      <div
        className="transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateY(${targetY}px)` }}
      >
        {calls.map((call) => (
          <div
            key={call.id}
            className="truncate pl-4 text-[11px] leading-[22px] text-muted-foreground"
            style={{ height: ROW_HEIGHT }}
          >
            {call.label}
          </div>
        ))}
      </div>
    </div>
  );
}
