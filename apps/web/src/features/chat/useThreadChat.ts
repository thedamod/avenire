"use client";

import { useChat } from "@ai-sdk/react";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { useEffect, useSyncExternalStore } from "react";

import type { ThreadChat } from "./chatStore.ts";

/** React view of a store chat: `useChat` throttled to ~50 ms plus the store's timings. */
export function useThreadChat(entry: ThreadChat) {
  const chat = useChat<RuthUIMessage>({ chat: entry.chat, throttle: 50 });
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void entry.hydrate().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [entry]);
  useSyncExternalStore(
    entry.subscribe,
    () => entry.version,
    () => entry.version,
  );
  return {
    ...chat,
    timings: entry.timings,
    turnStartedAt: entry.turnStartedAt,
    hydrated: entry.hydrated,
  };
}
