"use client";

import type { FileId, FolderId, RuthThread, ThreadId } from "@avenire/contracts";
import { call, invalidate } from "@avenire/client-runtime/rpc";
import { useArrivedLate } from "@avenire/ui/components/presence";
import { cn } from "@avenire/ui/lib/utils";
import * as Effect from "effect/Effect";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";

import { ChatHeader } from "./ChatHeader.tsx";
import { draftChat, dropThreadChat, threadChat, type ThreadChat } from "./chatStore.ts";
import { ChatComposer, type ComposerSubmission } from "./composer/ChatComposer.tsx";
import { scopeWith } from "./composer/CompactComposer.tsx";
import { useKeyboardInset } from "./composer/useKeyboardInset.ts";
import { collectCitations, type CitationMap } from "./logic/citations.ts";
import { pendingRequests, type PendingApproval } from "./logic/requests.ts";
import { createRowsDeriver } from "./logic/rows.ts";
import type { DeriveRowsInput } from "./logic/types.ts";
import { CitationContext } from "./markdown/Markdown.tsx";
import { measurePage, useWidgetTheme } from "./pageContext.ts";
import { MessagesTimeline } from "./timeline/MessagesTimeline.tsx";
import { TimelineContext, type TimelineActions } from "./timeline/TimelineRows.tsx";
import { ApprovalTray, ErrorTray, QuestionTray } from "./tray/RequestTray.tsx";
import { useLibraryIndex } from "./useLibraryIndex.ts";
import { useThreadChat } from "./useThreadChat.ts";

/** `?q=` handed over from home's Ask Ruth: sent once per thread, then stripped from the URL. */
const handedOver = new Set<string>();

/** Keep the previous map while the set of cited chunks is unchanged, so prose rows don't re-render. */
function useStableCitations(messages: Parameters<typeof collectCitations>[0]): CitationMap {
  const previous = useRef<CitationMap>(new Map());
  return useMemo(() => {
    const next = collectCitations(messages);
    const prev = previous.current;
    if (next.size === prev.size && [...next.keys()].every((key) => prev.has(key))) return prev;
    previous.current = next;
    return next;
  }, [messages]);
}

export function ChatView({
  threadId,
  initialQuestion,
  initialFiles,
  initialFast,
}: {
  readonly threadId?: ThreadId;
  readonly initialQuestion?: string;
  readonly initialFiles?: readonly string[];
  /** `?fast=1` from a surface that already chose Ruth Fast (the note composer). */
  readonly initialFast?: boolean;
}) {
  const api = useApi();
  const router = useRouter();
  const pathname = usePathname();
  const library = useLibraryIndex();
  const [entry] = useState<ThreadChat>(() =>
    threadId ? threadChat(api, threadId) : draftChat(api),
  );
  const chat = useThreadChat(entry);
  const { colorScheme, tokens } = useWidgetTheme();
  const keyboardInset = useKeyboardInset();
  // A thread that was still loading fades in over its skeleton; a cached one is just there.
  const hydratedLate = useArrivedLate(chat.hydrated ? true : undefined);

  const thread = useQuery(
    (client) => (threadId ? client["ruth.getThread"]({ threadId }) : Effect.succeed(undefined)),
    threadId ? `threads:${threadId}` : "threads:none",
  );
  const threadData: RuthThread | undefined = threadId ? thread.data : undefined;

  const [folderId, setFolderId] = useState<FolderId | null>(null);
  const folderTouched = useRef(false);
  useEffect(() => {
    if (!folderTouched.current && threadData) setFolderId(threadData.folderId);
  }, [threadData]);
  const [fast, setFast] = useState(() => (initialFast ? (entry.fast = true) : entry.fast));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followSignal, setFollowSignal] = useState(0);
  const [workExpanded, setWorkExpanded] = useState<ReadonlyMap<string, boolean>>(new Map());

  const measureTarget = useRef<HTMLDivElement>(null);
  entry.measure = () => measurePage(measureTarget.current);

  useEffect(() => {
    entry.hydrate().catch((cause: unknown) => setLoadError(errorMessage(cause)));
  }, [entry]);

  const send = useCallback(
    async ({ text, references }: ComposerSubmission) => {
      const baseScope = folderId ? { folderIds: [folderId] } : {};
      entry.scope = scopeWith(baseScope, references);
      entry.fast = fast;
      try {
        const id = await entry.ensureThread(text, folderId);
        if (!threadId) router.replace(`/chat/${id}`);
        setFollowSignal((value) => value + 1);
        void entry
          .send({ text, references })
          .catch((cause: unknown) => toast.error(`Couldn't reach Ava: ${errorMessage(cause)}`));
      } catch (cause) {
        toast.error(`Couldn't start the chat: ${errorMessage(cause)}`);
        return false;
      }
    },
    [entry, fast, folderId, router, threadId],
  );

  // Home's Ask Ruth: /chat/[id]?q=… sends the question once, then strips it from the URL.
  useEffect(() => {
    if (!initialQuestion || !chat.hydrated) return;
    const key = `${threadId ?? "new"}:${initialQuestion}`;
    if (handedOver.has(key)) return;
    handedOver.add(key);
    router.replace(pathname);
    if (entry.chat.messages.length > 0) return;
    const references = (initialFiles ?? []).map((id) => ({
      kind: "file" as const,
      id,
      label: library.fileById.get(id as FileId)?.title ?? "file",
    }));
    void send({ text: initialQuestion, references });
  }, [
    chat.hydrated,
    entry,
    initialFiles,
    initialQuestion,
    library.fileById,
    pathname,
    router,
    send,
    threadId,
  ]);

  const status = chat.status;
  const busy = status === "submitted" || status === "streaming";
  const errorText = chat.error ? errorMessage(chat.error) : null;
  const deriver = useMemo(createRowsDeriver, []);
  const input = useMemo<DeriveRowsInput>(
    () => ({
      messages: chat.messages,
      status,
      workExpanded,
      timings: chat.timings,
      turnStartedAt: chat.turnStartedAt,
      error: errorText,
    }),
    [chat.messages, status, workExpanded, chat.timings, chat.turnStartedAt, errorText],
  );
  const rows = deriver(input);
  const citations = useStableCitations(chat.messages);
  const requests = useMemo(() => pendingRequests(chat.messages), [chat.messages]);
  const question = requests.questions[0];
  // A turn that failed before this page loaded leaves the user's message without a reply.
  const last = chat.messages.at(-1);
  const unanswered =
    status === "ready" &&
    chat.hydrated &&
    (last?.role === "user" ||
      (last?.role === "assistant" && !last.parts.some((part) => part.type !== "step-start")));

  const timeline = useMemo<TimelineActions>(
    () => ({
      toggleWork: (messageId, expanded) =>
        setWorkExpanded((current) => new Map(current).set(messageId, expanded)),
      colorScheme,
      themeTokens: tokens,
    }),
    [colorScheme, tokens],
  );

  const fail = (cause: unknown) => toast.error(errorMessage(cause));
  const decide = (approvals: readonly PendingApproval[], approved: boolean) => {
    for (const approval of approvals) void entry.approve(approval.approvalId, approved).catch(fail);
  };

  const setFullAccess = async (enabled: boolean) => {
    if (!threadId) return;
    try {
      const updated = await call(api, (client) =>
        client["ruth.setFullAccess"]({ threadId, enabled }),
      );
      thread.setData(updated);
    } catch (cause) {
      fail(cause);
    }
  };

  const tray = question ? (
    <QuestionTray
      questions={requests.questions}
      onAnswer={(item, answers) => void entry.answer(item.toolCallId, answers).catch(fail)}
      onSkip={(item) =>
        void entry.answer(item.toolCallId, ["(The user skipped this question.)"]).catch(fail)
      }
    />
  ) : requests.approvalGroups.length ? (
    <ApprovalTray
      groups={requests.approvalGroups}
      library={library}
      onDecide={decide}
      onAlwaysAllow={(group) => {
        void setFullAccess(true);
        decide(group, true);
      }}
      onCancel={() => {
        for (const group of requests.approvalGroups) decide(group, false);
      }}
    />
  ) : status === "error" && errorText ? (
    <ErrorTray
      message={errorText}
      onRetry={() => void entry.chat.regenerate().catch(fail)}
      onDismiss={() => entry.chat.clearError()}
    />
  ) : unanswered ? (
    <ErrorTray
      message="Ava didn't reply to this message."
      onRetry={() => void entry.chat.regenerate().catch(fail)}
    />
  ) : null;

  // The composer dock floats over the list; the list pads its end by the dock's height.
  const dock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(140);
  useLayoutEffect(() => {
    const element = dock.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setDockHeight(Math.round(element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const folder = folderId ? library.folderById.get(folderId) : undefined;
  const headerFolder = threadData?.folderId ? library.folderById.get(threadData.folderId) : folder;
  const empty = chat.hydrated && rows.length === 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <ChatHeader
        thread={threadData}
        folder={headerFolder}
        onRename={async (title) => {
          if (!threadId) return;
          try {
            thread.setData(
              await call(api, (client) => client["ruth.renameThread"]({ threadId, title })),
            );
            invalidate(api, ["threads"]);
          } catch (cause) {
            fail(cause);
          }
        }}
        onFullAccess={setFullAccess}
        onDelete={async () => {
          if (!threadId) return;
          try {
            await call(api, (client) => client["ruth.deleteThread"]({ threadId }));
            dropThreadChat(api, threadId);
            invalidate(api, ["threads"]);
            router.push("/");
          } catch (cause) {
            fail(cause);
          }
        }}
      />
      <main className="relative min-h-0 flex-1 @container/chat-view">
        <CitationContext.Provider value={citations}>
          <TimelineContext.Provider value={timeline}>
            {chat.hydrated ? (
              <div className={cn("h-full", hydratedLate && "enter-fade")}>
                <MessagesTimeline
                  rows={rows}
                  threadKey={threadId ?? entry.key}
                  bottomInset={dockHeight + keyboardInset}
                  followSignal={followSignal}
                />
              </div>
            ) : (
              <TimelineSkeleton
                error={loadError}
                onRetry={() => {
                  setLoadError(null);
                  entry.hydrate().catch((cause: unknown) => setLoadError(errorMessage(cause)));
                }}
              />
            )}
          </TimelineContext.Provider>
        </CitationContext.Provider>
        {empty ? (
          <div className="pointer-events-none absolute inset-x-0 top-[28%] mx-auto max-w-[46rem] px-5 text-center @min-[776px]/chat-view:px-0">
            <p className="text-[15px] text-foreground-soft">
              {folder ? `Ask Ava about ${folder.name}.` : "Ask Ava about your notes and sources."}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Type @ to point at a source or note.
            </p>
          </div>
        ) : null}
        <div
          ref={dock}
          style={{ bottom: keyboardInset }}
          className="pointer-events-none absolute inset-x-0 z-20 bg-[linear-gradient(180deg,rgba(11,11,11,0)_0%,rgba(11,11,11,0.94)_30%,#0B0B0B_100%)] px-3 pt-7 pb-[max(env(safe-area-inset-bottom),20px)] md:bg-none md:px-6 md:pt-0 md:pb-5"
        >
          <div ref={measureTarget} className="pointer-events-auto mx-auto w-full max-w-[46rem]">
            <ChatComposer
              draftKey={threadId ?? entry.key}
              placeholder={
                question?.allowCustom
                  ? "Or type your own answer"
                  : "Ask Ava, @ a source or note, or / for commands"
              }
              busy={busy && !question}
              onStop={() => void entry.chat.stop()}
              disabled={!chat.hydrated}
              autoFocus
              folderId={folderId}
              onFolderChange={(value) => {
                folderTouched.current = true;
                setFolderId(value);
              }}
              fast={fast}
              onFastChange={setFast}
              tray={tray}
              onSubmit={(submission) => {
                if (question) {
                  return entry.answer(question.toolCallId, [submission.text]).then(
                    () => true,
                    (cause: unknown) => {
                      fail(cause);
                      return false;
                    },
                  );
                }
                return send(submission);
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function TimelineSkeleton({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}) {
  if (error)
    return (
      <div className="mx-auto flex max-w-[46rem] flex-col items-start gap-2 px-5 pt-10 @min-[776px]/chat-view:px-0">
        <p className="text-[13.5px] text-destructive">Couldn't load this chat: {error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-[13px] text-foreground-soft hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  return (
    <div
      aria-label="Loading chat"
      className="mx-auto flex max-w-[46rem] flex-col gap-6 px-5 pt-6 @min-[776px]/chat-view:px-0"
    >
      <div className="ml-auto h-12 w-2/3 animate-pulse rounded-2xl bg-white/[.04]" />
      <div className="h-4 w-32 animate-pulse rounded bg-white/[.04]" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-white/[.04]" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-white/[.04]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/[.04]" />
      </div>
    </div>
  );
}
