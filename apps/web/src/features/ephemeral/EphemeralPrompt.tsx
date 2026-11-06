"use client";

import type { FolderId, DesktopScreenObservation } from "@avenire/contracts";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, useApi } from "~/lib/rpc";
import { draftChat } from "~/features/chat/chatStore";
import {
  citationHref,
  citationLabel,
  citedSources,
  collectCitations,
  stripCitations,
} from "~/features/chat/logic/citations";
import { pendingRequests } from "~/features/chat/logic/requests";
import { deriveRows } from "~/features/chat/logic/rows";
import { ChatMarkdown } from "~/features/chat/markdown/Markdown";
import { measurePage } from "~/features/chat/pageContext";
import { useThreadChat } from "~/features/chat/useThreadChat";

import { SaveToNotebook } from "./SaveToNotebook.tsx";
import { plainText, streamingSentences } from "./sentences.ts";

const link = "text-[13px] text-foreground-soft transition-colors hover:text-foreground";

/** The keycap shown next to the question (Geist Mono 11.5, h24 r6 per the app values). */
function SpaceKeycap() {
  return (
    <kbd className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-input px-1.5 font-mono text-[11px] text-muted-foreground">
      ⌥ <span className="text-[10.5px]">Space</span>
    </kbd>
  );
}

/**
 * Ruth anywhere (09/10): a normal chat thread, shown as text only — the typed question, a
 * status line, then the reply sentence by sentence while it streams. Only the latest reply is
 * shown; a follow-up continues the same thread.
 */
export function EphemeralPrompt({
  session,
  initialQuestion,
  folderId,
  onDismiss,
  standalone = false,
}: {
  readonly session: number;
  readonly initialQuestion: string | null;
  /** The notebook in view: the new thread's folder and the save picker's guess. */
  readonly folderId: FolderId | null;
  readonly onDismiss: () => void;
  /** The `/prompt` window (Electron): links open in the main app. */
  readonly standalone?: boolean;
}) {
  const api = useApi();
  const router = useRouter();
  const entry = useMemo(() => draftChat(api), [api, session]);
  const chat = useThreadChat(entry);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const asked = useRef(false);
  const questionGeneration = useRef(0);
  const appliedAnnotations = useRef(new Set<string>());
  const screenOptOut = useRef(false);
  const captureSession = useRef<number | null>(null);
  const [screenContext, setScreenContext] = useState<DesktopScreenObservation | null>(null);
  const screenImage = useMemo(
    () => (screenContext ? `data:image/png;base64,${screenContext.data}` : null),
    [screenContext],
  );
  const [nativeSession, setNativeSession] = useState<number | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  useEffect(() => {
    entry.setMeasurement(() => ({ ...measurePage(root.current), surface: "ephemeral" }));
    asked.current = false;
  }, [entry]);

  const ask = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text) return;
      setDraft("");
      setScreenContext(null);
      setSubmissionFailed(false);
      const generation = questionGeneration.current;
      void (async () => {
        await entry.ensureThread(text, folderId);
        if (generation === questionGeneration.current) await entry.send({ text });
      })().catch((cause: unknown) => {
        if (generation !== questionGeneration.current) return;
        setSubmissionFailed(true);
        toast.error(`Couldn't reach Ruth: ${errorMessage(cause)}`);
      });
    },
    [entry, folderId, standalone],
  );

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      ask(initialQuestion);
    }
    input.current?.focus();
    // A new session (or a pre-filled question) restarts the overlay.
  }, [initialQuestion, ask]);

  const messages = chat.messages;
  const busy = chat.status === "submitted" || chat.status === "streaming";
  useEffect(() => {
    if (!standalone) return;
    const bridge = window.avenire;
    let active = true;
    if (bridge?.readScreen)
      entry.setScreenReader(async () => {
        if (!active || screenOptOut.current) throw new Error("Screen context disabled");
        const generation = questionGeneration.current;
        const context = await bridge.getPromptCaptureContext();
        const fresh = await bridge.readScreen(context.sessionId);
        if (
          !active ||
          generation !== questionGeneration.current ||
          screenOptOut.current ||
          !fresh.capture
        )
          throw new Error("Screen session closed");
        setScreenContext(fresh.capture);
        captureSession.current = fresh.sessionId;
        setNativeSession(fresh.sessionId);
        setNativeError(null);
        return fresh.capture;
      });
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      input.current?.focus();
      void bridge
        ?.getPromptCaptureContext?.()
        .then((context) => {
          if (!active || current !== revision) return;
          if (captureSession.current !== context.sessionId) {
            captureSession.current = context.sessionId;
            screenOptOut.current = false;
          }
          entry.setScreenContext(undefined);
          setScreenContext(screenOptOut.current ? null : context.capture);
          setNativeSession(context.sessionId);
          setNativeError(context.error ?? null);
        })
        .catch(() => {
          if (active && current === revision) setNativeError("Native overlay unavailable");
        });
    };
    refresh();
    const invalidated = bridge?.onScreenInvalidated?.((id) => {
      if (!active || captureSession.current !== id) return;
      questionGeneration.current++;
      entry.setScreenContext(undefined);
      setScreenContext(null);
      appliedAnnotations.current.clear();
      void entry.chat.stop();
    });
    const shown = bridge?.onPromptShown?.(refresh);
    const hidden = bridge?.onPromptHidden?.(() => {
      revision++;
      questionGeneration.current++;
      entry.setScreenContext(undefined);
      captureSession.current = null;
      setScreenContext(null);
      appliedAnnotations.current.clear();
      setNativeSession(null);
      void entry.chat.stop();
    });
    return () => {
      active = false;
      entry.setScreenReader(undefined);
      questionGeneration.current++;
      entry.setScreenContext(undefined);
      void entry.chat.stop();
      shown?.();
      hidden?.();
      invalidated?.();
    };
  }, [standalone, entry]);
  useEffect(() => {
    if (!standalone || nativeSession === null) return;
    let active = true;
    void window.avenire
      ?.setNativeOverlayState?.(nativeSession, {
        phase: busy && screenContext && !chat.error && !submissionFailed ? "thinking" : "idle",
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      })
      .catch(() => {
        if (active) setNativeError("Native overlay unavailable");
      });
    return () => {
      active = false;
    };
  }, [standalone, nativeSession, busy, screenContext, chat.error, submissionFailed]);
  useEffect(() => {
    if (!standalone || nativeSession === null) return;
    let active = true;
    const reply = messages.at(-1);
    if (reply?.role !== "assistant") return;
    for (const part of reply.parts) {
      if (
        (part.type !== "tool-native_annotate" &&
          part.type !== "tool-native_visualize" &&
          part.type !== "tool-native_diagram") ||
        part.state !== "output-available"
      )
        continue;
      const output = part.output;
      if (!output || output.capturedAt !== entry.screenContext?.capturedAt) continue;
      const key = `${nativeSession}:${part.toolCallId}`;
      if (appliedAnnotations.current.has(key)) continue;
      appliedAnnotations.current.add(key);
      const presentation =
        part.type === "tool-native_annotate"
          ? window.avenire?.annotateNativeOverlay?.(nativeSession, part.output.items)
          : window.avenire?.visualizeNativeOverlay?.(
              nativeSession,
              true,
              part.output.interactive,
              part.type === "tool-native_visualize" ? part.output.scene : undefined,
              part.type === "tool-native_diagram" ? part.output.diagram : undefined,
            );
      void presentation?.catch(() => {
        if (active) setNativeError("Native presentation unavailable");
      });
    }
    return () => {
      active = false;
    };
  }, [standalone, nativeSession, messages, entry]);
  // While a reply streams or is on screen, the desktop overlay stays up on blur; esc hides it.
  const holding = busy || messages.length > 0;
  useEffect(() => {
    if (standalone) void window.avenire?.setPromptBusy?.(holding);
  }, [standalone, holding]);
  useEffect(
    () => () => {
      if (standalone) void window.avenire?.setPromptBusy?.(false);
    },
    [standalone],
  );
  const lastUser = messages.findLast((message) => message.role === "user");
  const question =
    lastUser?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim() ?? "";
  const lastMessage = messages.at(-1);
  const reply = lastMessage?.role === "assistant" ? lastMessage : undefined;
  const replyText =
    reply?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n\n") ?? "";
  const citations = useMemo(() => collectCitations(messages), [messages]);
  const answer = useMemo(() => stripCitations(replyText, citations), [replyText, citations]);
  const sources = useMemo(() => citedSources(replyText, citations), [replyText, citations]);
  const needsYou = useMemo(() => {
    const pending = pendingRequests(messages);
    return pending.questions.length > 0 || pending.approvalGroups.length > 0;
  }, [messages]);

  const status = useMemo(() => {
    if (!busy) return null;
    const rows = deriveRows({
      messages: reply ? [reply] : [],
      status: chat.status,
      workExpanded: new Map(),
      timings: new Map(),
      turnStartedAt: null,
      error: null,
    });
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index]!;
      if (row.kind === "work") {
        const label = row.entries.at(-1)!.label;
        return label.charAt(0).toLowerCase() + label.slice(1);
      }
      if (row.kind === "prose") return null;
    }
    return "thinking…";
  }, [busy, reply, chat.status]);

  const streaming = busy && answer.length > 0;
  const sentences = useMemo(
    () => (streaming ? streamingSentences(plainText(answer)) : null),
    [streaming, answer],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const sourcesMarkdown = () =>
    sources.length
      ? `\n\n---\n\nSources: ${sources
          .map((source) => `[${citationLabel(source)}](${citationHref(source)})`)
          .join(" · ")}`
      : "";

  const openInChat = () => {
    if (!entry.threadId) return;
    const href = `/chat/${entry.threadId}`;
    if (standalone && window.avenire?.openInMain) void window.avenire.openInMain(href);
    else if (standalone) window.open(href, "_blank");
    else router.push(href);
    onDismiss();
  };

  const done = !busy && reply !== undefined && answer.length > 0;

  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Ask Ruth"
      className="flex w-full flex-col gap-2.5 [text-shadow:0_0_14px_#0b0b0b,0_0_4px_#0b0b0b]"
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) ask(draft);
        }}
      >
        <SpaceKeycap />
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={question ? "Ask a follow-up" : "Ask Ruth"}
          placeholder={question || "Ask Ruth anything"}
          disabled={busy}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none",
            question ? "placeholder:text-foreground-soft" : "placeholder:text-muted-foreground",
          )}
        />
      </form>

      {status ? <p className="text-[12.5px] text-ruth-text">Ruth · {status}</p> : null}

      {sentences ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          {sentences.previous ? (
            // The sentence that just finished settles out of focus: a 2px blur bridges the
            // 18px → 15px swap so it reads as one sentence receding, not two overlapping.
            <p
              key={sentences.previous}
              className="text-[15px] leading-[22px] text-muted-foreground transition-[opacity,filter] duration-slow ease-out starting:opacity-0 starting:blur-[2px]"
            >
              {sentences.previous}
            </p>
          ) : null}
          <p
            key={sentences.previous ?? ""}
            className="enter-rise text-[18px] leading-[26px] font-medium text-foreground"
          >
            {sentences.current}
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-[20px] w-[2px] translate-y-[3px] animate-pulse bg-ruth"
            />
          </p>
        </div>
      ) : null}

      {done ? (
        <div className="enter-fade flex flex-col gap-2.5">
          <ScrollFade className="max-h-[45vh] overflow-y-auto pr-1">
            <ChatMarkdown text={answer} className="text-[15px] leading-6 md:text-[15px]" />
          </ScrollFade>
          {sources.length ? (
            <p className="text-xs leading-4 text-muted-foreground">
              {sources.map((source, index) => (
                <span key={`${source.fileId}:${source.page}:${source.startSec}`}>
                  {index > 0 ? " · " : null}
                  <a href={citationHref(source)} className="hover:text-foreground">
                    {citationLabel(source)}
                  </a>
                </span>
              ))}
            </p>
          ) : null}
          <div className="flex items-center gap-4 pt-0.5">
            <SaveToNotebook
              standalone={standalone}
              title={question}
              guess={folderId}
              markdown={() => `${answer.trim()}${sourcesMarkdown()}`}
              className="text-[13px] font-medium text-ruth-text transition-opacity hover:opacity-80"
            />
            <button
              type="button"
              className={link}
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    `${plainText(answer)}${sources.length ? `\n\n${sources.map(citationLabel).join(" · ")}` : ""}`,
                  )
                  .then(() => toast.success("Copied"))
              }
            >
              Copy
            </button>
            <button type="button" className={link} onClick={openInChat}>
              Open in chat
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto font-mono text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              esc
            </button>
          </div>
        </div>
      ) : null}

      {needsYou && !busy ? (
        <p className="text-[13px] text-foreground-soft">
          Ruth needs your answer to continue ·{" "}
          <button type="button" className="text-ruth-text hover:opacity-80" onClick={openInChat}>
            Open in chat
          </button>
        </p>
      ) : null}

      {standalone && screenImage ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <img
            src={screenImage}
            alt="Screen context attached to this prompt"
            className="h-8 w-12 rounded border border-input object-cover"
          />
          <span>Using your screen</span>
          <button
            type="button"
            disabled={busy}
            className="underline disabled:opacity-50"
            onClick={() => {
              screenOptOut.current = true;
              entry.setScreenContext(undefined);
              setScreenContext(null);
              if (nativeSession !== null) void window.avenire?.clearNativeOverlay?.(nativeSession);
            }}
          >
            Remove
          </button>
        </div>
      ) : null}

      {standalone && nativeError ? (
        <p role="status" className="text-xs text-muted-foreground">
          Screen context unavailable. Ruth can still answer your question.
        </p>
      ) : null}

      {chat.error ? (
        <p className="text-[13px] text-destructive">
          {errorMessage(chat.error)} ·{" "}
          <button type="button" className="underline" onClick={() => void entry.chat.regenerate()}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
