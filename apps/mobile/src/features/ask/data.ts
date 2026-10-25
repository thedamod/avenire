import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useChat } from "@ai-sdk/react";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import {
  RUTH_CHAT_PATH,
  type FileId,
  type FolderId,
  type ThreadId,
} from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useQuery } from "../../lib/useRpc";
import { useApi } from "../../state/api";
import { apiUrl, getCookieHeader } from "../../state/auth";
import { colors } from "../../theme/tokens";

// Projection keys are matched by substring; keep user text out of the key.
export function searchKey(
  text: string,
  folderId: FolderId | null,
  fileIds: readonly FileId[],
) {
  let hash = 5381;
  const input = JSON.stringify([text, folderId, fileIds]);
  for (let index = 0; index < input.length; index++)
    hash = (hash * 33) ^ input.charCodeAt(index);
  return `search-${(hash >>> 0).toString(36)}`;
}
export function useAskSearch(
  text: string,
  folderId: FolderId | null,
  fileIds: readonly FileId[],
) {
  const result = useQuery(
    (client) =>
      client["search.query"]({
        text,
        limit: 30,
        ...(folderId ? { folderIds: [folderId] } : {}),
        ...(fileIds.length ? { fileIds: [...fileIds] } : {}),
      }),
    searchKey(text, folderId, fileIds),
  );
  const hits = useMemo(() => {
    const seen = new Set<FileId>();
    return result.data?.hits.filter(
      (hit) => !seen.has(hit.fileId) && Boolean(seen.add(hit.fileId)),
    );
  }, [result.data]);
  return { ...result, hits };
}

/** Same server-owned history protocol as web chatStore; native fetch must stream. */
export function useAskSession(
  folderId: FolderId | null,
  fileIds: readonly FileId[],
) {
  const api = useApi();
  const { width } = useWindowDimensions();
  const [threadId, setThreadId] = useState<ThreadId>();
  const thread = useRef<ThreadId>(undefined);
  const scope = useRef({ folderId, fileIds, width });
  scope.current = { folderId, fileIds, width };
  const active = useRef(true);
  const locked = useRef(false);
  const cancelled = useRef(false);
  const creation = useRef<AbortController | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>();
  const [startedAt, setStartedAt] = useState<number>();
  const [finishedAt, setFinishedAt] = useState<number>();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      creation.current?.abort();
    };
  }, []);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: `${apiUrl.replace(/\/$/, "")}${RUTH_CHAT_PATH}`,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        credentials: "omit",
        headers: getCookieHeader,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            threadId: thread.current,
            message: messages.at(-1),
            page: {
              surface: "chat",
              platform: "mobile",
              contentWidthPx: Math.max(1, Math.round(scope.current.width - 40)),
              colorScheme: "dark",
              themeTokens: { ...colors },
              fonts: { body: "system-ui", mono: "Geist Mono" },
            },
            ...(scope.current.folderId || scope.current.fileIds.length
              ? {
                  scope: {
                    ...(scope.current.folderId
                      ? { folderIds: [scope.current.folderId] }
                      : {}),
                    ...(scope.current.fileIds.length
                      ? { fileIds: [...scope.current.fileIds] }
                      : {}),
                  },
                }
              : {}),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          },
        }),
      }),
    [],
  );
  const chat = useChat<RuthUIMessage>({
    transport,
    throttle: 50,
    onFinish: () => {
      setFinishedAt(Date.now());
      invalidateLibrary(api, ["threads"]);
    },
  });
  const sendMessage = chat.sendMessage;
  const clearError = chat.clearError;
  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || locked.current) return false;
      locked.current = true;
      cancelled.current = false;
      setCreating(true);
      setError(undefined);
      clearError();
      setStartedAt(Date.now());
      setFinishedAt(undefined);
      try {
        if (!thread.current) {
          creation.current = new AbortController();
          const created = await call(
            api,
            (client) =>
              client["ruth.createThread"]({
                title: text.slice(0, 120),
                ...(scope.current.folderId
                  ? { folderId: scope.current.folderId }
                  : {}),
              }),
            { signal: creation.current.signal },
          );
          creation.current = undefined;
          thread.current = created.id;
          if (!active.current) return false;
          setThreadId(created.id);
          invalidateLibrary(api, ["threads"]);
        }
        if (!active.current || cancelled.current) return false;
        setCreating(false);
        await sendMessage({
          text,
          metadata: {
            createdAt: new Date().toISOString(),
            ...(scope.current.fileIds.length
              ? {
                  references: scope.current.fileIds.map((id) => ({
                    kind: "file" as const,
                    id,
                  })),
                }
              : {}),
          },
        });
        return true;
      } catch (cause) {
        if (active.current && !cancelled.current) setError(cause);
        return false;
      } finally {
        locked.current = false;
        if (active.current) {
          setCreating(false);
          setFinishedAt(Date.now());
        }
      }
    },
    [api, sendMessage, clearError],
  );
  const stop = async () => {
    cancelled.current = true;
    creation.current?.abort();
    await chat.stop();
    setFinishedAt(Date.now());
  };
  const retry = async (question: string) => {
    if (!chat.messages.some((message) => message.role === "user"))
      return send(question);
    if (locked.current) return false;
    locked.current = true;
    cancelled.current = false;
    setError(undefined);
    clearError();
    setStartedAt(Date.now());
    setFinishedAt(undefined);
    try {
      await chat.regenerate();
      return true;
    } catch (cause) {
      if (!cancelled.current) setError(cause);
      return false;
    } finally {
      locked.current = false;
      setFinishedAt(Date.now());
    }
  };
  return {
    ...chat,
    send,
    stop,
    retry,
    threadId,
    startedAt,
    finishedAt,
    busy:
      creating || chat.status === "submitted" || chat.status === "streaming",
    error: error ?? chat.error,
  };
}
