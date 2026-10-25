"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileId, NoteContent } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { errorMessage, useApi } from "~/lib/rpc";

export type SaveStatus = "saved" | "saving" | "conflict" | "error";

const DEBOUNCE_MS = 800;

function isConflict(cause: unknown): boolean {
  return (cause as { _tag?: string } | null)?._tag === "Conflict";
}

/**
 * Autosave for one note. Edits are pulled lazily (`read`) so typing never serialises the
 * document; a save runs ~800 ms after typing stops and on blur, tab hide and unmount. Each
 * save sends the revision it started from; a stale one comes back as Conflict and stops
 * autosaving until the user picks Reload or Keep mine.
 */
export function useNoteAutosave({
  fileId,
  read,
}: {
  fileId: FileId;
  /** Current title and markdown, or null while the editor isn't ready. */
  read: () => { title: string; markdown: string } | null;
}) {
  const api = useApi();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const revision = useRef<string | null>(null);
  const saved = useRef<{ title: string; markdown: string } | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const conflict = useRef(false);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  /** Call once the note is loaded (and after Reload) with what the server has. */
  const reset = useCallback((note: NoteContent) => {
    revision.current = note.revision;
    saved.current = { title: note.title, markdown: note.markdown };
    conflict.current = false;
    setStatus("saved");
    setError(null);
  }, []);

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    if (conflict.current || !revision.current) return Promise.resolve();
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const current = readRef.current();
    if (!current) return Promise.resolve();
    const title = current.title.trim() || "Untitled";
    const last = saved.current;
    if (last && last.markdown === current.markdown && last.title === title) {
      setStatus((previous) => (previous === "saving" ? "saved" : previous));
      return Promise.resolve();
    }
    setStatus("saving");
    const run = call(api, (client) =>
      client["library.saveNote"]({
        fileId,
        markdown: current.markdown,
        ...(last?.title === title ? {} : { title }),
        baseRevision: revision.current!,
      }),
    )
      .then((note) => {
        revision.current = note.revision;
        saved.current = { title, markdown: current.markdown };
        setError(null);
        setStatus("saved");
        invalidateLibrary(api, ["files", "folders"]);
      })
      .catch((cause: unknown) => {
        if (isConflict(cause)) {
          conflict.current = true;
          setStatus("conflict");
        } else {
          setError(errorMessage(cause));
          setStatus("error");
        }
      })
      .finally(() => {
        inflight.current = null;
        if (again.current && !conflict.current) {
          again.current = false;
          void flushRef.current();
        }
      });
    inflight.current = run;
    return run;
  }, [api, fileId]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Something changed: show "Saving…" and save once typing pauses. */
  const touch = useCallback(() => {
    if (conflict.current) return;
    setStatus((previous) => (previous === "error" ? previous : "saving"));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  /** Keep mine: rebase onto the server's latest revision and save this text over it. */
  const keepMine = useCallback(async () => {
    try {
      const latest = await call(api, (client) => client["library.getNote"]({ fileId }));
      revision.current = latest.revision;
      saved.current = { title: latest.title, markdown: latest.markdown };
      conflict.current = false;
      await flush();
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus("error");
    }
  }, [api, fileId, flush]);

  /** Reload: fetch the latest version; the caller puts it in the editor. */
  const reload = useCallback(async () => {
    const latest = await call(api, (client) => client["library.getNote"]({ fileId }));
    reset(latest);
    return latest;
  }, [api, fileId, reset]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      // Route change: save whatever is pending; the runtime outlives the page.
      void flush();
    };
  }, [flush]);

  return { status, error, reset, touch, flush, keepMine, reload };
}
