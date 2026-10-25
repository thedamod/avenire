"use client";

import { useEffect } from "react";
import { useApi, useQuery } from "~/lib/rpc";
import { useLibrary } from "./LibraryProvider";
import { prefetchChat, prefetchNotebook } from "./prefetch";

/** Warm a small recent working set after the initial library has painted. */
export function LibraryPrefetch() {
  const api = useApi();
  const { folders, files } = useLibrary();
  const threads = useQuery((client) => client["ruth.listThreads"](), "library-threads");

  useEffect(() => {
    if (!folders || !files || !threads.data) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const connection = (
        navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
      ).connection;
      if (connection?.saveData || connection?.effectiveType?.includes("2g")) return;
      const recentChats = threads
        .data!.filter((thread) => thread.kind === "chat")
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3);
      // One destination at a time keeps speculative work from flooding the RPC transport.
      const work = [
        ...folders.slice(0, 3).map((folder) => () => prefetchNotebook(api, folder.id)),
        ...recentChats.map((thread) => () => prefetchChat(api, thread.id)),
      ];
      for (const load of work) {
        if (cancelled || document.visibilityState !== "visible") return;
        // Keep speculative destination loads serial to leave room for navigation requests.
        // eslint-disable-next-line no-await-in-loop
        await load();
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [api, folders, files, threads.data]);

  return null;
}
