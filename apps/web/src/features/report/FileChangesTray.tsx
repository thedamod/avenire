"use client";

import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Button } from "@avenire/ui/components/button";
import {
  ComposerTray,
  ComposerTrayActions,
  ComposerTrayBody,
} from "@avenire/ui/components/composer-tray";
import { cn } from "@avenire/ui/lib/utils";
import { AlertCircle, ChevronDown, FilePen, Moon } from "lucide-react";
import { memo, useState } from "react";

import { changesMeta, type FileChange, type FileChanges } from "./logic/report.ts";

/**
 * "Ruth wants to change 3 files" above the composer (08 / 08b / M12 / M17). Collapsed by
 * default; the chevron lists each change with Skip / Accept (on hover on desktop).
 */
export const FileChangesTray = memo(function FileChangesTray({
  changes,
  busy,
  onDecide,
  onDecideAll,
}: {
  readonly changes: FileChanges;
  /** Approval ids with a request in flight. */
  readonly busy: ReadonlySet<string>;
  readonly onDecide: (change: FileChange, decision: "accept" | "skip") => void;
  readonly onDecideAll: (decision: "accept" | "skip") => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const total = changes.rows.length;
  const files = `${total} ${total === 1 ? "file" : "files"}`;
  const meta = changesMeta(changes);
  const phoneMeta = changesMeta(changes, " · ");
  const deciding = busy.size > 0;
  const all = (header: boolean) => (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={deciding}
        onClick={() => onDecideAll("skip")}
        className={header ? "max-md:hidden" : undefined}
      >
        Skip all
      </Button>
      <Button
        size="sm"
        disabled={deciding}
        onClick={() => onDecideAll("accept")}
        className="md:bg-ruth md:text-ruth-foreground md:hover:bg-ruth/90"
      >
        Accept all
      </Button>
    </>
  );
  return (
    <ComposerTray collapsed={collapsed}>
      <div className="flex min-h-7 items-center gap-2.5">
        <Moon className="size-[15px] shrink-0 text-ruth" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-1.5">
          <span className="truncate text-[15px] leading-5 font-semibold md:text-[13px]">
            <span className="md:hidden">
              {total} file {total === 1 ? "change" : "changes"}
            </span>
            <span className="max-md:hidden">Ava wants to change {files}</span>
          </span>
          {meta ? (
            <span className="truncate text-[12.5px] text-muted-foreground md:text-xs">
              <span className="max-md:hidden">· {meta}</span>
              <span className="md:hidden">{phoneMeta}</span>
            </span>
          ) : null}
        </div>
        {/* Desktop keeps the bulk actions in the header; the expanded phone tray puts them below. */}
        <div className={cn("flex items-center gap-1", !collapsed && "max-md:hidden")}>
          {all(true)}
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Show each change" : "Hide the changes"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          className="-my-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-soft transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
      <ComposerTrayBody>
        <ScrollFade as="ul" className="max-h-56 overflow-y-auto">
          {changes.rows.map((change) => (
            <ChangeRow
              key={change.approvalId}
              change={change}
              busy={busy.has(change.approvalId)}
              onDecide={onDecide}
            />
          ))}
        </ScrollFade>
        <ComposerTrayActions className="md:hidden">{all(false)}</ComposerTrayActions>
      </ComposerTrayBody>
    </ComposerTray>
  );
});

const DONE: Record<string, string> = {
  accepted: "Accepted",
  skipped: "Skipped",
  resolved: "Reviewed",
};

function ChangeRow({
  change,
  busy,
  onDecide,
}: {
  readonly change: FileChange;
  readonly busy: boolean;
  readonly onDecide: (change: FileChange, decision: "accept" | "skip") => void;
}) {
  const open = change.status === "pending" || change.status === "conflict";
  return (
    <li className="group/change flex min-h-11 items-center gap-2.5 border-t border-border py-2 md:min-h-9 md:py-1.5">
      {change.status === "conflict" ? (
        <AlertCircle className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <FilePen className="size-3.5 shrink-0 text-foreground-soft" />
      )}
      <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-1.5">
        <span className="truncate text-[14px] leading-5 md:text-[13px]">
          <span className="max-md:hidden">Update </span>
          <span className="md:hidden">Update · </span>
          {change.title}
        </span>
        {change.detail ? (
          <span
            className={cn(
              "truncate text-xs leading-4",
              change.status === "conflict" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {change.detail}
          </span>
        ) : null}
      </span>
      {open ? (
        <span className="flex shrink-0 items-center gap-1 transition-opacity md:opacity-0 md:group-hover/change:opacity-100 md:group-focus-within/change:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDecide(change, "skip")}
          >
            Skip
          </Button>
          {change.status === "conflict" ? null : (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onDecide(change, "accept")}
            >
              Accept
            </Button>
          )}
        </span>
      ) : (
        <span
          className={cn(
            "shrink-0 pr-1 text-[12.5px]",
            change.status === "accepted" ? "text-success" : "text-muted-foreground",
          )}
        >
          {DONE[change.status]}
        </span>
      )}
    </li>
  );
}
