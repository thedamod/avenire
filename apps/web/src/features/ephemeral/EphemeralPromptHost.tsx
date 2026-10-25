"use client";

import type { FileId, FolderId } from "@avenire/contracts";
import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useIsMobile } from "~/lib/responsive";
import { useLibraryIndex } from "~/features/chat/useLibraryIndex";

import { EphemeralPrompt } from "./EphemeralPrompt.tsx";
import { ephemeralPrompt, useEphemeralState } from "./store.ts";

/** True for ⌥ Space / Alt+Space (on macOS the event's key is a non-breaking space). */
export function isEphemeralShortcut(event: KeyboardEvent): boolean {
  return (
    event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.code === "Space"
  );
}

/** The notebook in view: /notebooks/[id], or a note's first notebook on /notes/[id]. */
function useFolderInView(): FolderId | null {
  const pathname = usePathname();
  const library = useLibraryIndex();
  const notebook = /^\/notebooks\/([^/?#]+)/.exec(pathname)?.[1];
  if (notebook) return decodeURIComponent(notebook) as FolderId;
  const note = /^\/(?:notes|sources)\/([^/?#]+)/.exec(pathname)?.[1];
  if (note) return library.fileById.get(decodeURIComponent(note) as FileId)?.folderIds[0] ?? null;
  return null;
}

function OpenPrompt({ session, question }: { session: number; question: string | null }) {
  const folderId = useFolderInView();
  const close = useCallback(() => ephemeralPrompt.close(), []);
  return (
    // Opened from the keyboard many times a day: appears and leaves instantly (no animation).
    <div className="pointer-events-auto fixed right-8 bottom-8 z-50 w-[min(22rem,calc(100vw-4rem))] max-md:hidden">
      <EphemeralPrompt
        key={session}
        session={session}
        initialQuestion={question}
        folderId={folderId}
        onDismiss={close}
      />
    </div>
  );
}

/**
 * Ruth anywhere: mount once in the app shell. Binds ⌥ Space / Alt+Space to toggle the corner
 * prompt (desktop widths only; phones use Ask Ruth on home).
 */
export function EphemeralPromptHost() {
  const phone = useIsMobile();
  const state = useEphemeralState();
  useEffect(() => {
    if (phone) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isEphemeralShortcut(event)) return;
      event.preventDefault();
      ephemeralPrompt.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone]);
  useEffect(() => {
    if (phone) ephemeralPrompt.close();
  }, [phone]);
  if (phone || !state.open) return null;
  return <OpenPrompt session={state.session} question={state.question} />;
}
