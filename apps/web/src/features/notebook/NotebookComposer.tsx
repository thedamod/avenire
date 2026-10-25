"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Folder, FolderId } from "@avenire/contracts";
import { ArrowUp, Plus } from "lucide-react";
import { Kbd } from "@avenire/ui/components/kbd";
import { cn } from "@avenire/ui/lib/utils";
import { ScopePicker } from "~/features/home/ScopePicker";
import { useIsMobile } from "~/lib/responsive";

export interface NotebookComposerHandle {
  focus(): void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * "Search this notebook or ask a question" (07 / M09). Desktop: a borderless 20px field with a
 * tool row (Create note, scope, Search ⌘ Enter, Ask Ruth Enter). Phone: the bottom capsule,
 * which grows on focus to show the scope and the Search / Ask Ruth buttons.
 */
export const NotebookComposer = forwardRef<
  NotebookComposerHandle,
  {
    value: string;
    onValueChange: (value: string) => void;
    folders: readonly Folder[];
    scope: FolderId | null;
    onScopeChange: (scope: FolderId | null) => void;
    onCreateNote: () => void;
    onSearch: () => void;
    onAsk: () => void;
    onEscape: () => void;
    /** Phone: the selection dock takes the composer's place. */
    hidden?: boolean;
  }
>(function NotebookComposer(props, ref) {
  const { value, onValueChange, onSearch, onAsk, onEscape, onCreateNote, hidden } = props;
  const isMobile = useIsMobile();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const empty = value.trim().length === 0;

  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }), []);

  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, isMobile ? 132 : 200)}px`;
  }, [value, isMobile, focused]);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      textarea.current?.blur();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (empty) return;
    if (event.metaKey || event.ctrlKey) onSearch();
    else onAsk();
  }

  const field = (
    <textarea
      ref={textarea}
      rows={1}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      placeholder={
        isMobile ? "Search this notebook or ask" : "Search this notebook or ask a question"
      }
      aria-label="Search this notebook or ask Ruth"
      enterKeyHint="send"
      className="block w-full resize-none bg-transparent text-[16px] leading-[22px] text-foreground caret-ruth outline-none placeholder:text-muted-foreground md:text-[20px] md:leading-7 md:tracking-[-0.01em]"
    />
  );

  const scope = (
    <ScopePicker
      folders={props.folders}
      scope={props.scope}
      onScopeChange={props.onScopeChange}
      {...(isMobile ? { className: "h-8 max-w-40 rounded-full border border-input px-3" } : {})}
    />
  );

  if (!isMobile)
    return (
      <div className="flex flex-col gap-4">
        {field}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={onCreateNote}
            className="inline-flex h-8 items-center gap-2 text-[13px] text-foreground-soft transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Create note
          </button>
          {scope}
          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              disabled={empty}
              onClick={onSearch}
              className="inline-flex h-8 items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
            >
              Search
              <Kbd className="h-5 border-b border-input bg-surface-4 text-muted-foreground">
                {isMac ? "⌘" : "Ctrl"} Enter
              </Kbd>
            </button>
            <button
              type="button"
              disabled={empty}
              onClick={onAsk}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-ruth-line bg-ruth-tint pr-1.5 pl-3 text-[13px] font-semibold text-ruth-text transition-colors hover:bg-ruth/20 disabled:opacity-70"
            >
              Ask Ruth
              <Kbd className="h-5 border-b border-ruth-line bg-ruth/15 text-ruth-text">Enter</Kbd>
            </button>
          </div>
        </div>
      </div>
    );

  const open = focused || !empty;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-b from-transparent via-background/95 via-30% to-background px-3 pt-7 pb-[calc(10px+env(safe-area-inset-bottom))]",
        hidden && "hidden",
      )}
    >
      <div
        ref={container}
        onBlur={(event) => {
          const next = event.relatedTarget as HTMLElement | null;
          if (next?.closest("[data-radix-popper-content-wrapper]")) return;
          if (!container.current?.contains(next)) setFocused(false);
        }}
        className={cn(
          "pointer-events-auto border border-white/[.07] bg-[rgba(20,20,20,0.88)] backdrop-blur-[16px]",
          open ? "rounded-[24px] p-2 pt-3" : "rounded-[26px] pr-[9px] pl-1",
        )}
      >
        <div className={cn("flex items-center gap-0.5", open ? "px-2" : "h-[52px]")}>
          {open ? null : (
            <button
              type="button"
              aria-label="Create note"
              onClick={onCreateNote}
              className="inline-flex size-11 shrink-0 items-center justify-center text-foreground-soft"
            >
              <Plus className="size-[18px]" />
            </button>
          )}
          <div className="min-w-0 flex-1">{field}</div>
          {open ? null : (
            <button
              type="button"
              aria-label="Ask Ruth"
              disabled={empty}
              onClick={onAsk}
              className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ruth text-ruth-foreground disabled:opacity-60"
            >
              <ArrowUp className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
        {open ? (
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              aria-label="Create note"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCreateNote}
              className="inline-flex size-11 shrink-0 items-center justify-center text-foreground-soft"
            >
              <Plus className="size-[18px]" />
            </button>
            {scope}
            <button
              type="button"
              disabled={empty}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onSearch}
              className="ml-auto h-11 px-3 text-[15px] text-foreground-soft disabled:opacity-50"
            >
              Search
            </button>
            <button
              type="button"
              disabled={empty}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAsk}
              className="h-[34px] rounded-full bg-ruth px-3.5 text-[15px] font-semibold text-ruth-foreground disabled:opacity-60"
            >
              Ask Ruth
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
