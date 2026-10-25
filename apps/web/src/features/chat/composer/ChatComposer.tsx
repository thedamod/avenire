"use client";

import type { FolderId } from "@avenire/contracts";
import { usePresence } from "@avenire/ui/components/presence";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import { FileText, LoaderCircle, Paperclip, Plus, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { NotebookSwatch } from "~/components/app";
import { useIsMobile, useIsTouch } from "~/lib/responsive";

import { nextComposerLayout, type ComposerLayout } from "../logic/composerLayout.ts";
import { useLibraryIndex } from "../useLibraryIndex.ts";
import { ControlDivider, RuthModelMenu, ScopePicker, SendButton, WhenMenu } from "./controls.tsx";
import {
  activeTrigger,
  liveReferences,
  menuItems,
  type ComposerReference,
  type MenuItem,
} from "./mentions.ts";
import { historySize, recallPrompt, rememberPrompt } from "./promptHistory.ts";
import { uploadAttachment } from "./uploadAttachment.ts";

export interface ComposerSubmission {
  readonly text: string;
  readonly references: readonly ComposerReference[];
}

export interface ChatComposerProps {
  /** `full`: chat page (controls inside; capsule at rest on phone). `compact`: one row that stacks. */
  readonly variant?: "full" | "compact";
  /** Drafts persist per key while the app is open. */
  readonly draftKey: string;
  readonly placeholder?: string;
  readonly busy?: boolean;
  readonly onStop?: () => void;
  readonly disabled?: boolean;
  /** Return `false` (or reject) to keep the draft. */
  readonly onSubmit: (input: ComposerSubmission) => boolean | void | Promise<boolean | void>;
  readonly folderId?: FolderId | null;
  readonly onFolderChange?: (folderId: FolderId | null) => void;
  readonly fast?: boolean;
  readonly onFastChange?: (fast: boolean) => void;
  /** Composer drop-up (approvals, questions, errors) attached above the surface. */
  readonly tray?: ReactNode;
  /** Rendered under a compact composer (scope / mode strip). */
  readonly below?: ReactNode;
  readonly autoFocus?: boolean;
  readonly className?: string;
}

const drafts = new Map<string, string>();

/** Width taken by the capsule's own chrome (attach + send + padding); the text gets the rest. */
const INLINE_CHROME_PX = 104;
const MAX_TEXT_HEIGHT = 160;

/** The glass composer surface (radius 24, rgba(17,17,17,.8) + blur 16, white-5% outline). */
export const composerSurface =
  "relative z-10 rounded-[24px] bg-[rgba(17,17,17,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur-[16px] supports-[not(backdrop-filter:blur(1px))]:bg-[#111]";

interface Upload {
  readonly id: string;
  readonly name: string;
  readonly state: "uploading" | "failed";
  readonly error?: string;
  readonly promise: Promise<ComposerReference | null>;
}

export function ChatComposer({
  variant = "full",
  draftKey,
  placeholder = "Ask Ruth, @ a source or note, or / for commands",
  busy = false,
  onStop,
  disabled = false,
  onSubmit,
  folderId = null,
  onFolderChange,
  fast = false,
  onFastChange,
  tray,
  below,
  autoFocus = false,
  className,
}: ChatComposerProps) {
  const router = useRouter();
  const phone = useIsMobile();
  const touch = useIsTouch();
  const library = useLibraryIndex();
  const [text, setTextState] = useState(() => drafts.get(draftKey) ?? "");
  const [caret, setCaret] = useState(0);
  const [references, setReferences] = useState<ComposerReference[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [focused, setFocused] = useState(false);
  const [layout, setLayout] = useState<ComposerLayout>("inline");
  const [highlight, setHighlight] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeControlMenu, setActiveControlMenu] = useState<"model" | "scope" | "when" | null>(
    null,
  );
  const historyCursor = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const mirror = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Keep the last tray mounted for its 150ms exit after the request is answered.
  const shownTray = usePresence(tray ?? null, 150);

  const setText = useCallback(
    (value: string) => {
      setTextState(value);
      drafts.set(draftKey, value);
    },
    [draftKey],
  );

  useEffect(() => {
    setTextState(drafts.get(draftKey) ?? "");
    setReferences([]);
    historyCursor.current = 0;
  }, [draftKey]);

  // Desktop full composer is always expanded; the phone capsule grows when focused or when
  // its text no longer fits on one line (with hysteresis, measured at the inline width).
  const expanded =
    variant === "full" ? !phone || focused || layout === "stacked" : layout === "stacked";

  useLayoutEffect(() => {
    if (variant === "full" && !phone) return;
    const width = form.current?.clientWidth ?? 0;
    const contentWidth = mirror.current?.scrollWidth ?? 0;
    setLayout((current) =>
      nextComposerLayout(current, { text, contentWidth, inlineWidth: width - INLINE_CHROME_PX }),
    );
  }, [text, variant, phone]);

  // Grow with the text up to 160px, then scroll inside.
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0px";
    const height = Math.min(element.scrollHeight, MAX_TEXT_HEIGHT);
    element.style.height = `${height}px`;
    element.style.overflowY = element.scrollHeight > MAX_TEXT_HEIGHT ? "auto" : "hidden";
  }, [text, expanded]);

  useEffect(() => {
    if (autoFocus && !touch) textarea.current?.focus();
  }, [autoFocus, touch]);

  const trigger = useMemo(
    () => (menuDismissed || !focused ? null : activeTrigger(text, caret)),
    [text, caret, focused, menuDismissed],
  );
  const items = useMemo(
    () => (trigger ? menuItems(trigger, library.folders, library.files) : []),
    [trigger, library.folders, library.files],
  );
  useEffect(() => setHighlight(0), [trigger?.kind, trigger?.query]);

  const pick = (item: MenuItem) => {
    if (!trigger) return;
    const before = text.slice(0, trigger.start);
    const after = text.slice(caret);
    let insert: string;
    if (item.type === "command") insert = item.command.text;
    else {
      const label = item.type === "folder" ? item.folder.name : item.file.title;
      insert = `@${label} `;
      setReferences((current) => [
        ...current,
        item.type === "folder"
          ? { kind: "folder", id: item.folder.id, label }
          : { kind: "file", id: item.file.id, label },
      ]);
    }
    const next = before + insert + after;
    setText(next);
    const position = before.length + insert.length;
    requestAnimationFrame(() => {
      textarea.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const attach = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const id = crypto.randomUUID();
      const promise = uploadAttachment(file)
        .then((uploaded): ComposerReference => {
          setUploads((current) => current.filter((upload) => upload.id !== id));
          const reference = { kind: "file" as const, id: uploaded.id, label: uploaded.title };
          setReferences((current) => [...current, reference]);
          return reference;
        })
        .catch((cause: unknown) => {
          setUploads((current) =>
            current.map((upload) =>
              upload.id === id
                ? {
                    ...upload,
                    state: "failed" as const,
                    error: cause instanceof Error ? cause.message : "Upload failed",
                  }
                : upload,
            ),
          );
          return null;
        });
      setUploads((current) => [...current, { id, name: file.name, state: "uploading", promise }]);
    }
  };

  const attachedFiles = references.filter(
    (reference) => reference.kind === "file" && !text.includes(`@${reference.label}`),
  );

  const submit = async () => {
    const value = text.trim();
    if ((!value && !attachedFiles.length) || busy || disabled || sending) return;
    setSending(true);
    try {
      // Uploads started on attach; wait for any still in flight so the message can cite them.
      const pending = await Promise.all(
        uploads.filter((upload) => upload.state === "uploading").map((upload) => upload.promise),
      );
      const refs = [
        ...liveReferences(text, references),
        ...attachedFiles,
        ...pending.filter((reference): reference is ComposerReference => reference !== null),
      ].filter(
        (reference, index, all) => all.findIndex((other) => other.id === reference.id) === index,
      );
      const message = value || `Look at ${refs.map((reference) => reference.label).join(", ")}`;
      const result = await onSubmit({ text: message, references: refs });
      if (result === false) return;
      rememberPrompt(message);
      historyCursor.current = 0;
      setText("");
      setReferences([]);
      setUploads((current) => current.filter((upload) => upload.state === "failed"));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (items.length && trigger) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight(
          (index) => (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(items[highlight] ?? items[0]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !touch) {
      event.preventDefault();
      void submit();
      return;
    }
    const element = event.currentTarget;
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0;
    if (event.key === "ArrowUp" && (text === "" || (historyCursor.current > 0 && atStart))) {
      if (historyCursor.current >= historySize()) return;
      event.preventDefault();
      historyCursor.current += 1;
      setText(recallPrompt(historyCursor.current) ?? "");
      return;
    }
    if (event.key === "ArrowDown" && historyCursor.current > 0) {
      event.preventDefault();
      historyCursor.current -= 1;
      setText(recallPrompt(historyCursor.current) ?? "");
    }
  };

  const tonight = () => {
    const params = new URLSearchParams({ schedule: "1" });
    if (text.trim()) params.set("prompt", text.trim());
    router.push(`/tasks?${params.toString()}`);
  };

  const canSend = (text.trim().length > 0 || attachedFiles.length > 0) && !disabled && !sending;
  const capsule = !expanded;
  const showControls = variant === "full" && expanded;
  const attachButton = (
    <button
      type="button"
      aria-label="Attach files"
      onClick={() => fileInput.current?.click()}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-foreground-soft transition-colors hover:text-foreground",
        capsule ? "size-11" : "size-8 hover:bg-hover",
      )}
    >
      {capsule && variant === "full" ? (
        <Plus className="size-[18px]" />
      ) : (
        <Paperclip className="size-4" />
      )}
    </button>
  );

  return (
    <div ref={container} className={cn("relative w-full", className)}>
      {shownTray.value ? (
        // The tray rises from behind the composer and, once answered, sinks back (globals.css).
        <ScrollFade
          data-composer-overlay
          data-closing={shownTray.closing || undefined}
          inert={shownTray.closing}
          className="pointer-events-auto absolute inset-x-0 bottom-[calc(100%-16px)] z-0 max-h-[min(60dvh,32rem)] overflow-y-auto overscroll-contain [&_[data-slot=composer-tray]]:mb-0"
        >
          {shownTray.value}
        </ScrollFade>
      ) : null}
      <div className="overflow-visible">
        <form
          ref={form}
          data-layout={expanded ? "stacked" : "inline"}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onFocus={() => {
            clearTimeout(blurTimer.current);
            setFocused(true);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as HTMLElement | null;
            if (next && (container.current?.contains(next) || next.closest("[role=menu]"))) return;
            blurTimer.current = setTimeout(() => setFocused(false), 120);
          }}
          className={cn(
            composerSurface,
            "grid items-center",
            capsule
              ? "min-h-[52px] grid-cols-[auto_minmax(0,1fr)_auto] gap-0.5 rounded-[26px] pr-[9px] pl-1 max-md:bg-[rgba(20,20,20,0.88)]"
              : "grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3 pt-3 pb-4",
            variant === "compact" && !capsule && "rounded-[20px]",
          )}
          style={{
            gridTemplateAreas: capsule
              ? '"attach text actions"'
              : '"chips chips" "text text" "controls actions"',
          }}
        >
          {/* Hidden mirror: the text on one line, for the inline ↔ stacked measurement. */}
          <span
            ref={mirror}
            aria-hidden="true"
            className="pointer-events-none invisible absolute top-0 left-0 overflow-hidden text-[15px] whitespace-pre md:text-[14px]"
          >
            {text}
          </span>

          {trigger && items.length ? (
            <MentionMenu items={items} highlight={highlight} onPick={pick} onHover={setHighlight} />
          ) : null}

          {capsule ? <div style={{ gridArea: "attach" }}>{attachButton}</div> : null}

          {!capsule && (uploads.length > 0 || attachedFiles.length > 0) ? (
            <div style={{ gridArea: "chips" }} className="flex flex-wrap gap-1.5 px-2 pb-2">
              {attachedFiles.map((reference) => (
                <AttachmentChip
                  key={reference.id}
                  label={reference.label}
                  onRemove={() =>
                    setReferences((current) => current.filter((item) => item.id !== reference.id))
                  }
                />
              ))}
              {uploads.map((upload) => (
                <AttachmentChip
                  key={upload.id}
                  label={upload.name}
                  state={upload.state}
                  {...(upload.error ? { error: upload.error } : {})}
                  onRemove={() =>
                    setUploads((current) => current.filter((item) => item.id !== upload.id))
                  }
                />
              ))}
            </div>
          ) : null}

          <textarea
            ref={textarea}
            value={text}
            rows={1}
            aria-label="Message Ruth"
            placeholder={placeholder}
            disabled={disabled}
            enterKeyHint={touch ? "enter" : "send"}
            onChange={(event) => {
              setText(event.target.value);
              setCaret(event.target.selectionStart);
              setMenuDismissed(false);
              if (event.target.value === "") historyCursor.current = 0;
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            style={{ gridArea: "text" }}
            className={cn(
              "block w-full resize-none bg-transparent text-[15px] leading-5 text-foreground outline-none placeholder:text-muted-foreground md:text-[14px] md:leading-[22px]",
              capsule ? "py-[14px]" : "min-h-[44px] px-2 pt-1 pb-3",
              variant === "compact" && !capsule && "min-h-0",
            )}
          />

          {showControls ? (
            <div
              style={{ gridArea: "controls" }}
              className="flex min-w-0 items-center gap-0.5 overflow-hidden"
            >
              <RuthModelMenu
                fast={fast}
                onFastChange={(value) => onFastChange?.(value)}
                open={activeControlMenu === "model"}
                onOpenChange={(open) => setActiveControlMenu(open ? "model" : null)}
              />
              <ControlDivider />
              <ScopePicker
                folderId={folderId}
                folders={library.folders}
                onChange={(value) => onFolderChange?.(value)}
                open={activeControlMenu === "scope"}
                onOpenChange={(open) => setActiveControlMenu(open ? "scope" : null)}
              />
              <ControlDivider />
              <WhenMenu
                onTonight={tonight}
                open={activeControlMenu === "when"}
                onOpenChange={(open) => setActiveControlMenu(open ? "when" : null)}
              />
            </div>
          ) : null}

          <div
            style={{ gridArea: "actions" }}
            className={cn("flex items-center justify-end gap-1", capsule ? "" : "self-end")}
          >
            {capsule ? null : attachButton}
            <SendButton
              busy={busy}
              disabled={!canSend}
              onStop={() => onStop?.()}
              size={capsule && variant === "full" ? 34 : 32}
            />
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              attach(event.target.files);
              event.target.value = "";
            }}
          />
        </form>
      </div>
      {below}
    </div>
  );
}

function AttachmentChip({
  label,
  state,
  error,
  onRemove,
}: {
  readonly label: string;
  readonly state?: "uploading" | "failed";
  readonly error?: string;
  readonly onRemove: () => void;
}) {
  return (
    <span
      title={error}
      className={cn(
        "inline-flex h-[26px] max-w-56 items-center gap-1.5 rounded-full border border-input pr-1 pl-2.5 text-xs",
        state === "failed" ? "text-destructive" : "text-foreground-soft",
      )}
    >
      {state === "uploading" ? (
        <LoaderCircle className="size-3 shrink-0 animate-spin" />
      ) : state === "failed" ? (
        <TriangleAlert className="size-3 shrink-0" />
      ) : (
        <Paperclip className="size-3 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex size-5 items-center justify-center rounded-full hover:bg-hover hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function MentionMenu({
  items,
  highlight,
  onPick,
  onHover,
}: {
  readonly items: readonly MenuItem[];
  readonly highlight: number;
  readonly onPick: (item: MenuItem) => void;
  readonly onHover: (index: number) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Suggestions"
      className="dropdown-glass absolute right-3 bottom-full left-3 z-30 mb-2 max-h-72 overflow-y-auto rounded-[10px] p-1 shadow-none"
    >
      {items.map((item, index) => {
        const key =
          item.type === "folder"
            ? item.folder.id
            : item.type === "file"
              ? item.file.id
              : item.command.id;
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={index === highlight}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item)}
            onMouseEnter={() => onHover(index)}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] md:h-8",
              index === highlight ? "bg-hover text-foreground" : "text-foreground-soft",
            )}
          >
            {item.type === "folder" ? (
              <>
                <NotebookSwatch color={item.folder.color} />
                <span className="min-w-0 flex-1 truncate">{item.folder.name}</span>
                <span className="text-xs text-muted-foreground">Notebook</span>
              </>
            ) : item.type === "file" ? (
              <>
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.file.title}</span>
                <span className="text-xs text-muted-foreground">
                  {item.file.kind === "note" ? "Note" : "Source"}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-[12px] text-foreground">{item.command.label}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.command.detail}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
