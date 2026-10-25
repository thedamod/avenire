"use client";

import { useEffect } from "react";
import { shouldTrashSelection } from "./selectionKeyboard";
import type { FileId } from "@avenire/contracts";
import { X, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@avenire/ui/components/tooltip";
import { cn } from "@avenire/ui/lib/utils";
import { useFileActions } from "./useFileActions";
import type { Selection } from "./useSelection";

/**
 * Icon-only dock with a count (18b / M27): move to notebook, ask Ruth about these, download,
 * trash, clear. Floats at the bottom on desktop; replaces the composer on phone, with a
 * Cancel · N selected · Select all bar on top.
 */
export function SelectionDock({
  selection,
  noun: _noun = "source",
  allIds,
  canDownload = true,
}: {
  selection: Selection;
  noun?: string;
  /** Everything selectable on screen, for "Select all". */
  allIds: readonly FileId[];
  canDownload?: boolean;
}) {
  const count = selection.size;
  const label = `${count} selected`;
  const { actions, dialogs, moving, openMove } = useFileActions({
    ids: [...selection.ids],
    onComplete: selection.clear,
  });
  useEffect(() => {
    if (!count) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const editing = !!target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
      );
      const overlayOpen = !!document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [data-slot="popover-content"][data-state="open"]',
      );
      if (!shouldTrashSelection(event, count, editing, overlayOpen)) return;
      const trash = actions.find((action) => action.id === "trash");
      if (!trash || trash.disabled) return;
      event.preventDefault();
      trash.onSelect?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, count]);
  const buttons = actions
    .filter(
      (action) =>
        ["move", "ask", "download", "trash"].includes(action.id) &&
        (canDownload || action.id !== "download"),
    )
    .map((action) => (
      <DockButton
        key={action.id}
        icon={action.icon!}
        label={action.label}
        active={action.id === "move" && moving}
        onClick={action.id === "move" ? openMove : () => action.onSelect?.()}
      />
    ));

  return (
    <>
      {/* Phone: selection bar replaces the page header. */}
      <div
        aria-hidden={count === 0}
        inert={count === 0}
        className={cn(
          "surface-glass fixed inset-x-0 top-[var(--desktop-titlebar-height,0px)] z-40 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between px-5 pt-[env(safe-area-inset-top)] transition-[opacity,translate] duration-moderate ease-out motion-reduce:transition-opacity md:hidden",
          count
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0 duration-popover motion-reduce:translate-y-0",
        )}
      >
        <button
          type="button"
          onClick={selection.clear}
          className="h-11 text-[15px] text-foreground-soft"
        >
          Cancel
        </button>
        <span className="text-[15px] font-semibold">{label}</span>
        <button
          type="button"
          onClick={() => selection.set(allIds)}
          className="h-11 text-[15px] text-foreground-soft"
        >
          Select all
        </button>
      </div>

      <div
        role="toolbar"
        aria-label={label}
        aria-hidden={count === 0}
        inert={count === 0}
        className={cn(
          "fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 flex h-14 items-center justify-between gap-1 rounded-[28px] border border-sheet-border bg-[#161616] px-2 transition-[opacity,translate] duration-moderate ease-out motion-reduce:transition-opacity md:inset-x-auto md:bottom-8 md:left-1/2 md:h-12 md:-translate-x-1/2 md:justify-start md:rounded-xl md:px-1.5",
          count
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0 duration-popover motion-reduce:translate-y-0",
        )}
      >
        <span className="px-3 text-[13px] font-semibold whitespace-nowrap max-md:hidden">
          {label}
        </span>
        <span className="mx-1 h-5 w-px bg-border max-md:hidden" />
        {buttons}
        <span className="mx-1 h-5 w-px bg-border max-md:hidden" />
        <DockButton icon={X} label="Clear selection" onClick={selection.clear} />
      </div>
      {dialogs}
    </>
  );
}

function DockButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            "motion-press inline-flex size-11 items-center justify-center rounded-full text-foreground-soft outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:size-9 md:rounded-lg [&_svg]:size-[17px] md:[&_svg]:size-4",
            active && "bg-surface-5 text-foreground",
          )}
        >
          <Icon />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-md:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
