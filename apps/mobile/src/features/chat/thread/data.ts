import { Chat, useChat } from "@ai-sdk/react";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { CLOUD_RUN_PATH, RUTH_CHAT_PATH, type CloudRunId, type ThreadId } from "@avenire/contracts";
import { call, ConversationSession, conversationSession, invalidate, type ClientRuntime } from "@avenire/client-runtime/rpc";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, validateUIMessages } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, useWindowDimensions } from "react-native";
import { useQuery } from "../../../lib/useRpc";
import { useApi } from "../../../state/api";
import { apiUrl, getCookieHeader } from "../../../state/auth";
import { colors } from "../../../theme/tokens";
import type { TurnTiming } from "./types";

export const widgetTokens: Readonly<Record<string, string>> = {
  "--background": colors.bg, "--foreground": colors.fg, "--foreground-soft": colors["fg-2"],
  "--card": colors.sheet, "--border": colors.line, "--ruth": colors.accent,
  "--font-sans": "system-ui, sans-serif", "--font-mono": "ui-monospace, monospace",
  "--text-base": "16px", "--text-xs": "12px", "--text-sm": "14px", "--leading-normal": "1.5",
  "--figure-page": "#0b0b0b", "--figure-card": "#131313", "--figure-text": "#a3a3a3",
  "--figure-strong": "#e6e6e6", "--figure-muted": "#6e6e6e", "--figure-paper": "#131313",
  "--figure-face": "#1b1b1b", "--figure-top": "#1c1c1c", "--figure-shade-0": "#0f0f0f",
  "--figure-shade-1": "#121212", "--figure-shade-2": "#151515", "--figure-shade-3": "#181818",
  "--figure-lit-top": "#262626", "--figure-lit-shade": "#1d1d1d", "--figure-hi": "#d4d4d4",
  "--figure-mid": "#6a6a6a", "--figure-lo": "#3e3e3e", "--figure-faint": "#2a2a2a",
  "--figure-lit": "#ffffff", "--figure-dot": "#e6e6e6", "--figure-red": colors.red,
  "--figure-green": colors.green, "--figure-blue": "#6b9bff", "--stroke-hairline": "0.6px",
  "--stroke-thin": "1px", "--stroke-regular": "1.5px", "--stroke-emphasis": "2px",
};

const nativeFetch = expoFetch as unknown as typeof globalThis.fetch;

function entryFor(api: ClientRuntime, threadId: ThreadId) {
  const entries = conversationSession<RuthUIMessage>(api).retain(
    () => new Map<ThreadId, ReturnType<typeof createEntry>>(),
    (entries) => {
      for (const entry of entries.values()) {
        void entry.chat.stop();
        entry.session.dispose();
      }
    },
  );
  let entry = entries.get(threadId);
  if (!entry) {
    entry = createEntry(api, threadId);
    entries.set(threadId, entry);
  }
  return entry;
}

function createEntry(api: ClientRuntime, threadId: ThreadId) {
  const session = new ConversationSession<RuthUIMessage>();
  session.threadId = threadId;
  const timing = { startedAt: null as number | null, turns: new Map<string, TurnTiming>() };
  let width = 350;
  const chat = new Chat<RuthUIMessage>({
    id: threadId,
    transport: new DefaultChatTransport({
      api: `${apiUrl}${RUTH_CHAT_PATH}`,
      fetch: nativeFetch,
      credentials: "omit",
      headers: getCookieHeader,
      prepareSendMessagesRequest: ({ messages }) => ({
        body: {
          threadId, message: messages.at(-1),
          page: { surface: "chat", platform: "mobile", contentWidthPx: width, colorScheme: "dark", themeTokens: widgetTokens, fonts: { body: "system-ui", mono: "ui-monospace" } },
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      }),
    }),
    sendAutomaticallyWhen: (options) => lastAssistantMessageIsCompleteWithApprovalResponses(options) || lastAssistantMessageIsCompleteWithToolCalls(options),
    onFinish: ({ message }) => {
      const startedAt = timing.startedAt;
      if (startedAt !== null) timing.turns.set(message.id, { startedAt, finishedAt: Date.now() });
      timing.startedAt = null;
      invalidate(api, ["threads", "files", "folders"]);
    },
  });
  return {
    chat, session, timing,
    setWidth: (value: number) => { width = Math.max(1, Math.round(value)); },
    hydrate: (refresh = false) => {
      if (chat.status === "streaming" || chat.status === "submitted") return Promise.resolve();
      if (refresh) session.ready = false;
      const before = chat.messages;
      return session.hydrate(async () => {
      const saved = await call(api, (client) => client["ruth.listMessages"]({ threadId }));
      const messages = saved.length ? await validateUIMessages<RuthUIMessage>({ messages: saved.map(({ id, role, parts, metadata }) => ({ id, role, parts, ...(metadata == null ? {} : { metadata }) })) }) : [];
      if (chat.messages === before && chat.status !== "streaming" && chat.status !== "submitted") chat.messages = messages;
      return { threadId, messages };
      });
    },
  };
}

/** Same latest-message transport and continuation predicates as the web thread store. */
export function useThread(threadId: ThreadId, q?: string) {
  const api = useApi();
  const { width } = useWindowDimensions();
  const entry = useMemo(() => entryFor(api, threadId), [api, threadId]);
  entry.setWidth(width - 40);
  const chat = useChat({ chat: entry.chat, throttle: 50 });
  const thread = useQuery((client) => client["ruth.getThread"]({ threadId }), `thread-${threadId}`);
  const folders = useQuery((client) => client["library.listFolders"](), "chat-folders");
  const files = useQuery((client) => client["library.listFiles"]({}), "chat-files");
  const [hydration, setHydration] = useState({ ready: entry.session.ready, error: undefined as unknown });
  const [actionError, setActionError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const active = useRef(new Set<string>());
  const reload = useCallback(async () => {
    setHydration({ ready: entry.session.ready, error: undefined });
    try { await entry.hydrate(true); setHydration({ ready: true, error: undefined }); }
    catch (error) { setHydration({ ready: false, error }); }
  }, [entry]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") { void thread.refetch(); void reload(); }
    });
    return () => listener.remove();
  }, [thread.refetch, reload]);
  const act = useCallback(async (key: string, action: () => PromiseLike<void> | void) => {
    if (active.current.has(key)) return;
    active.current.add(key); setPending(true); setActionError(undefined);
    try { await entry.session.respondOnce(key, action); }
    catch (error) { setActionError(error); throw error; }
    finally { active.current.delete(key); setPending(active.current.size > 0); }
  }, [entry]);
  const send = useCallback(async (text: string, options?: { runId?: CloudRunId; references?: readonly { kind: "file" | "folder"; id: string }[] }) => {
    const clean = text.trim();
    if (!clean || !entry.session.ready || entry.chat.status === "streaming" || entry.chat.status === "submitted") return;
    setActionError(undefined);
    entry.timing.startedAt = Date.now();
    await entry.session.send(() => entry.chat.sendMessage({ text: clean, metadata: { createdAt: new Date().toISOString(), ...(options?.runId ? { runId: options.runId } : {}), ...(options?.references?.length ? { references: [...options.references] } : {}) } }));
  }, [entry]);
  useEffect(() => {
    if (!hydration.ready || !q?.trim()) return;
    void act(`initial:${q}`, () => send(q)).catch(() => {});
  }, [act, hydration.ready, q, send]);
  return { ...chat, thread, folders, files, ready: hydration.ready, hydrationError: hydration.error, reload, send, act, pending, actionError, clearActionError: () => setActionError(undefined), entry };
}

export function latestRunId(messages: readonly RuthUIMessage[]): CloudRunId | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const part = messages[i]!.parts.find((part) => part.type === "data-cloud-run");
    if (part?.type === "data-cloud-run") return part.data.runId as CloudRunId;
  }
  return undefined;
}

/** Mounted only for a real Cloud marker; reconnect replays the durable event stream. */
export function useReport(runId: CloudRunId) {
  const api = useApi();
  const run = useQuery((client) => client["cloud.getRun"]({ runId }), `report-run-${runId}`);
  const approvals = useQuery((client) => client["cloud.listPendingApprovals"]({ runId, includeResolved: true }), `report-approvals-${runId}`);
  const [transport] = useState(() => new DefaultChatTransport<RuthUIMessage>({ api: `${apiUrl}${CLOUD_RUN_PATH}`, fetch: nativeFetch, credentials: "omit", headers: getCookieHeader }));
  const stream = useChat<RuthUIMessage>({ id: runId, transport, resume: true, throttle: 50 });
  const previous = useRef(stream.status);
  useEffect(() => {
    const was = previous.current; previous.current = stream.status;
    if ((was === "streaming" || was === "submitted") && was !== stream.status) {
      void run.refetch(); void approvals.refetch(); invalidate(api, ["files", "folders"]);
    }
  }, [api, stream.status, run.refetch, approvals.refetch]);
  const decide = async (approvalId: string, decision: "accept" | "skip") => {
    const approval = approvals.data?.find((item) => item.id === approvalId);
    if (!approval) throw new Error("This change is no longer available. Refresh the report.");
    const resolved = await call(api, (client) => client["cloud.resolveApproval"]({ approvalId: approval.id, decision }));
    approvals.setData((current) => current?.map((item) => item.id === resolved.id ? resolved : item));
    await approvals.refetch(); invalidate(api, ["files", "folders"]);
  };
  return { run, approvals, stream, decide };
}
