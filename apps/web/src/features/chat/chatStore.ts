"use client";

/**
 * One live `Chat` per thread, owned outside React so a reply keeps streaming while the user
 * moves between the thread page, the ⌥ Space overlay and the rest of the app. The thread page
 * and the ephemeral overlay both talk to Ruth through this store (same transport, same hook).
 */
import { Chat } from "@ai-sdk/react";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import {
  RUTH_CHAT_PATH,
  type ChatScope,
  type DesktopScreenObservation,
  type FolderId,
  type PageContext,
  type ThreadId,
} from "@avenire/contracts";
import { call, invalidate, type ClientRuntime } from "@avenire/client-runtime/rpc";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  validateUIMessages,
} from "ai";

import type { TurnTiming } from "./logic/types.ts";
import { measurePage } from "./pageContext.ts";

export interface SendOptions {
  readonly text: string;
  readonly references?: ReadonlyArray<{ kind: "file" | "folder"; id: string }>;
  /** Notebook for a new thread (it scopes retrieval by default). */
  readonly folderId?: FolderId | null;
}

export class ThreadChat {
  readonly chat: Chat<RuthUIMessage>;
  threadId: ThreadId | undefined;
  scope: ChatScope | undefined;
  fast = false;
  private nativeScreen: DesktopScreenObservation | undefined;
  private screenReader:
    | (() => Promise<DesktopScreenObservation | import("@avenire/contracts").ScreenSharingDisabled>)
    | undefined;
  setScreenReader(
    reader:
      | (() => Promise<
          DesktopScreenObservation | import("@avenire/contracts").ScreenSharingDisabled
        >)
      | undefined,
  ): void {
    this.screenReader = reader;
  }
  get screenContext(): DesktopScreenObservation | undefined {
    return this.nativeScreen;
  }
  setScreenContext(value: DesktopScreenObservation | undefined): void {
    this.nativeScreen = value;
  }
  setMeasurement(measure: () => PageContext): void {
    this.measure = measure;
  }
  measure: () => PageContext = () => measurePage(null);
  hydrated: boolean;
  timings: ReadonlyMap<string, TurnTiming> = new Map();
  turnStartedAt: number | null = null;
  private hydration: Promise<void> | null = null;
  private hydratedAt = 0;
  private creating: Promise<ThreadId> | null = null;
  private readonly decisions = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private lastStatus: string = "ready";

  private readonly api: ClientRuntime;
  readonly key: string;
  private readonly onThread: (entry: ThreadChat, id: ThreadId) => void;

  constructor(
    api: ClientRuntime,
    key: string,
    threadId: ThreadId | undefined,
    onThread: (entry: ThreadChat, id: ThreadId) => void,
  ) {
    this.api = api;
    this.key = key;
    this.onThread = onThread;
    this.threadId = threadId;
    this.hydrated = threadId === undefined;
    const transport = new DefaultChatTransport<RuthUIMessage>({
      api: RUTH_CHAT_PATH,
      // The server owns history; send only the latest message plus this turn's context.
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          threadId: this.threadId,
          message: messages.at(-1),
          page: this.measure(),
          ...(this.screenReader ? { nativeScreenAvailable: true } : {}),
          ...(this.screenContext ? { screenContext: this.screenContext } : {}),
          ...(this.scope && (this.scope.folderIds?.length || this.scope.fileIds?.length)
            ? { scope: this.scope }
            : {}),
          fast: this.fast,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    });
    this.chat = new Chat<RuthUIMessage>({
      id: threadId ?? key,
      transport,
      sendAutomaticallyWhen: (options) =>
        lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
        lastAssistantMessageIsCompleteWithToolCalls(options),
      onToolCall: async ({ toolCall }) => {
        if (toolCall.dynamic || toolCall.toolName !== "read_screen") return;
        const reader = this.screenReader;
        try {
          if (!reader) throw new Error("Local screen capture is unavailable here.");
          const capture = await reader();
          if (reader !== this.screenReader) throw new Error("Local screen session closed.");
          if ("status" in capture) {
            this.setScreenContext(undefined);
            void this.chat.addToolOutput({
              tool: "read_screen",
              toolCallId: toolCall.toolCallId,
              output: capture,
            });
            return;
          }
          this.setScreenContext(capture);
          // Do not await addToolOutput inside onToolCall (the SDK continues after this returns).
          void this.chat.addToolOutput({
            tool: "read_screen",
            toolCallId: toolCall.toolCallId,
            output: {
              status: "captured",
              capturedAt: capture.capturedAt,
              width: capture.width,
              height: capture.height,
            },
          });
        } catch {
          this.setScreenContext(undefined);
          void this.chat.addToolOutput({
            tool: "read_screen",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText:
              "Local screen capture is unavailable or the prompt was closed. Do not substitute the cloud desktop.",
          });
        }
      },
      onFinish: () => {
        invalidate(this.api, ["threads"]);
      },
    });
    this.chat["~registerStatusCallback"](() => this.trackStatus());
    this.chat["~registerMessagesCallback"](() => this.trackStreaming());
  }

  /** Timings are client-side: the turn's start and end as this device saw them. */
  private trackStatus() {
    const status = this.chat.status;
    const previous = this.lastStatus;
    this.lastStatus = status;
    if (status === "submitted" && previous !== "streaming") {
      this.turnStartedAt = Date.now();
      this.emit();
    }
    if ((status === "ready" || status === "error") && previous !== status) {
      const last = this.chat.messages.at(-1);
      if (last?.role === "assistant") {
        const started = this.timings.get(last.id)?.startedAt ?? this.turnStartedAt ?? Date.now();
        this.timings = new Map(this.timings).set(last.id, {
          startedAt: started,
          finishedAt: Date.now(),
        });
      }
      this.turnStartedAt = null;
      this.emit();
    }
  }

  private trackStreaming() {
    const last = this.chat.messages.at(-1);
    if (!last || last.role !== "assistant" || this.chat.status !== "streaming") return;
    const existing = this.timings.get(last.id);
    if (existing && existing.finishedAt === undefined) return;
    if (existing) {
      // A continuation (after an approval or answer) keeps the original start.
      this.timings = new Map(this.timings).set(last.id, { startedAt: existing.startedAt });
    } else {
      this.timings = new Map(this.timings).set(last.id, {
        startedAt: this.turnStartedAt ?? Date.now(),
      });
    }
    this.emit();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Bumped on every timing/hydration change; the React snapshot. */
  version = 0;

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Revalidate idle history without replacing messages edited or streamed during the request. */
  hydrate(): Promise<void> {
    if (!this.threadId || this.chat.status === "submitted" || this.chat.status === "streaming")
      return Promise.resolve();
    if (this.hydrated && Date.now() - this.hydratedAt < 30_000) return Promise.resolve();
    const threadId = this.threadId;
    const before = this.chat.messages;
    this.hydration ??= call(this.api, (client) => client["ruth.listMessages"]({ threadId }))
      .then((saved) =>
        // A brand-new thread has no messages, and validateUIMessages rejects an empty array.
        saved.length === 0
          ? []
          : validateUIMessages<RuthUIMessage>({
              messages: saved.map(({ id, role, parts, metadata }) => ({
                id,
                role,
                parts,
                ...(metadata == null ? {} : { metadata }),
              })),
            }),
      )
      .then((messages) => {
        if (
          this.chat.messages === before &&
          this.chat.status !== "submitted" &&
          this.chat.status !== "streaming"
        ) {
          this.chat.messages = messages;
          this.hydratedAt = Date.now();
        }
        this.hydrated = true;
        this.emit();
      })
      .finally(() => {
        this.hydration = null;
      });
    return this.hydration;
  }

  async ensureThread(title: string, folderId: FolderId | null | undefined): Promise<ThreadId> {
    if (this.threadId) return this.threadId;
    this.creating ??= call(this.api, (client) =>
      client["ruth.createThread"]({
        title: title.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat",
        ...(folderId ? { folderId } : {}),
      }),
    )
      .then((thread) => {
        this.threadId = thread.id;
        this.onThread(this, thread.id);
        invalidate(this.api, ["threads"]);
        return thread.id;
      })
      .finally(() => {
        this.creating = null;
      });
    return this.creating;
  }

  async send(options: SendOptions): Promise<ThreadId> {
    // Fresh user messages never inherit pixels from earlier turns.
    this.setScreenContext(undefined);
    const text = options.text.trim();
    if (!text) throw new Error("Type a message first.");
    const threadId = await this.ensureThread(text, options.folderId);
    await this.chat.sendMessage({
      text,
      metadata: {
        createdAt: new Date().toISOString(),
        ...(options.references?.length
          ? { references: options.references.map(({ kind, id }) => ({ kind, id })) }
          : {}),
      },
    });
    return threadId;
  }

  /** Approvals and answers are once-only, even if a button is pressed twice mid-request. */
  async respondOnce(key: string, action: () => PromiseLike<void> | void): Promise<void> {
    if (this.decisions.has(key)) return;
    this.decisions.add(key);
    try {
      await action();
    } catch (error) {
      this.decisions.delete(key);
      throw error;
    }
  }

  approve(approvalId: string, approved: boolean, reason?: string) {
    return this.respondOnce(`approval:${approvalId}`, () =>
      this.chat.addToolApprovalResponse({
        id: approvalId,
        approved,
        ...(reason ? { reason } : {}),
      }),
    );
  }

  answer(toolCallId: string, answers: readonly string[]) {
    const clean = answers.map((answer) => answer.trim()).filter(Boolean);
    if (!clean.length) return Promise.reject(new Error("Enter an answer."));
    return this.respondOnce(`tool:${toolCallId}`, () =>
      this.chat.addToolOutput({
        tool: "ask_user",
        toolCallId,
        output: { answers: clean },
      }),
    );
  }
}

const stores = new WeakMap<ClientRuntime, Map<string, ThreadChat>>();
let draftCounter = 0;

function storeFor(api: ClientRuntime): Map<string, ThreadChat> {
  let store = stores.get(api);
  if (!store) stores.set(api, (store = new Map()));
  return store;
}

/** The live chat for a thread, created on first use. */
export function threadChat(api: ClientRuntime, threadId: ThreadId): ThreadChat {
  const store = storeFor(api);
  let entry = store.get(threadId);
  if (!entry) {
    entry = new ThreadChat(api, threadId, threadId, () => {});
    store.set(threadId, entry);
  }
  return entry;
}

/** A chat with no thread yet; it registers under its thread id once the first send creates it. */
export function draftChat(api: ClientRuntime): ThreadChat {
  const store = storeFor(api);
  const key = `draft:${++draftCounter}`;
  const entry = new ThreadChat(api, key, undefined, (chat, id) => store.set(id, chat));
  return entry;
}

/** Forget a deleted thread. */
export function dropThreadChat(api: ClientRuntime, threadId: ThreadId) {
  const store = storeFor(api);
  const entry = store.get(threadId);
  if (entry) void entry.chat.stop();
  store.delete(threadId);
}
