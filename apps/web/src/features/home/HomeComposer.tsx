"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FileId, Folder, FolderId, LibraryFile } from "@avenire/contracts";
import { ArrowUp } from "lucide-react";
import { Kbd } from "@avenire/ui/components/kbd";
import { cn } from "@avenire/ui/lib/utils";
import { registerHomeComposer } from "~/components/app";
import { useIsMobile } from "~/lib/responsive";
import { AddContextButton, ContextChips } from "./AddContext";
import { ScopePicker } from "./ScopePicker";

export interface ComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  folders: readonly Folder[];
  scope: FolderId | null;
  onScopeChange: (scope: FolderId | null) => void;
  files: readonly LibraryFile[];
  context: readonly FileId[];
  onContextChange: (ids: FileId[]) => void;
  onSearch: () => void;
  onAsk: () => void;
  /** Esc: clear search results and go back to the tabs. */
  onEscape: () => void;
  /** Phone: the selection dock takes the composer's place. */
  hidden?: boolean;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The home composer. Desktop: a borderless 22px field with a tool row (01). Phone: a capsule
 * at the bottom that grows when focused and shows Search / Ask Ruth buttons (M01, M07).
 */
export function HomeComposer(props: ComposerProps) {
  const { value, onValueChange, onSearch, onAsk, onEscape, hidden } = props;
  const isMobile = useIsMobile();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const empty = value.trim().length === 0;

  useEffect(() => registerHomeComposer(() => textarea.current?.focus()), []);

  // Grow with the text (no field-sizing in Safari yet).
  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, isMobile ? 132 : 240)}px`;
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

  const contextFiles = props.files.filter((file) => props.context.includes(file.id));
  const removeContext = (id: FileId) =>
    props.onContextChange(props.context.filter((item) => item !== id));

  const field = (
    <textarea
      ref={textarea}
      rows={1}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      placeholder={isMobile ? "Search or ask Ava" : "Search your files, web, ask AI anything"}
      aria-label="Search your files or ask Ava"
      enterKeyHint="send"
      className="block w-full resize-none bg-transparent text-[16px] leading-[22px] text-foreground caret-ruth outline-none placeholder:text-muted-foreground md:text-[22px] md:leading-[30px] md:tracking-[-0.01em]"
    />
  );

  if (!isMobile)
    return (
      <div ref={container} className="flex flex-col gap-4">
        {field}
        <ContextChips files={contextFiles} onRemove={removeContext} />
        <div className="flex items-center gap-5">
          <AddContextButton
            files={props.files}
            selected={props.context}
            onChange={props.onContextChange}
          />
          <ScopePicker
            folders={props.folders}
            scope={props.scope}
            onScopeChange={props.onScopeChange}
          />
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
              Ask Ava
              <Kbd className="h-5 border-b border-ruth-line bg-ruth/15 text-ruth-text">Enter</Kbd>
            </button>
          </div>
        </div>
      </div>
    );

  const open = focused || !empty;
  return (
    <div
      ref={container}
      onBlur={(event) => {
        const next = event.relatedTarget as HTMLElement | null;
        // Menus and popovers portal out of the capsule; keep it open while they're in use.
        if (next?.closest("[data-radix-popper-content-wrapper]")) return;
        if (!container.current?.contains(next)) setFocused(false);
      }}
      className={cn(
        "fixed inset-x-3 bottom-[calc(18px+env(safe-area-inset-bottom))] z-30 border border-sheet-border bg-[#161616]/90 backdrop-blur-[16px]",
        open ? "rounded-[24px] p-2 pt-3" : "rounded-[27px] px-1.5",
        hidden && "hidden",
      )}
    >
      {/* The textarea keeps one position in the tree so focus survives the capsule growing. */}
      <div className={cn("flex items-center gap-1", open ? "px-2" : "h-[52px]")}>
        {open ? null : (
          <AddContextButton
            compact
            files={props.files}
            selected={props.context}
            onChange={props.onContextChange}
          />
        )}
        <div className="min-w-0 flex-1">{field}</div>
        {open ? null : (
          <button
            type="button"
            aria-label="Ask Ava"
            disabled={empty}
            onClick={onAsk}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ruth text-ruth-foreground disabled:opacity-60"
          >
            <ArrowUp className="size-4" strokeWidth={2} />
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          <ContextChips files={contextFiles} onRemove={removeContext} />
          <div className="flex items-center gap-1">
            <AddContextButton
              compact
              files={props.files}
              selected={props.context}
              onChange={props.onContextChange}
            />
            <ScopePicker
              folders={props.folders}
              scope={props.scope}
              onScopeChange={props.onScopeChange}
              className="h-8 max-w-36 rounded-full border border-input px-3"
            />
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
              Ask Ava
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
