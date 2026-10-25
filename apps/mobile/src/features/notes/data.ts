import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import type { FileId, NoteContent } from "@avenire/contracts";
import { useApi } from "../../state/api";
import { useQuery } from "../../lib/useRpc";

export type SaveStatus = "saved" | "saving" | "conflict" | "error";
export function useNote(fileId: FileId) {
  const api = useApi();
  const file = useQuery((client) => client["library.getFile"]({ fileId }), `note-files-${fileId}`);
  const [note, setNote] = useState<NoteContent>();
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>();
  const [saveError, setSaveError] = useState<unknown>();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const draft = useRef({ title: "", markdown: "" });
  const saved = useRef<NoteContent | undefined>(undefined);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<Promise<boolean> | undefined>(undefined);
  const generation = useRef(0);
  const active = useRef(true);

  const reset = useCallback((value: NoteContent) => {
    clearTimeout(timer.current);
    saved.current = value;
    const displayTitle = value.title === "Untitled" && !value.markdown.trim() ? "" : value.title;
    draft.current = { title: displayTitle, markdown: value.markdown };
    conflict.current = false;
    setNote(value);
    setTitle(displayTitle);
    setMarkdown(value.markdown);
    setStatus("saved");
    setSaveError(undefined);
  }, []);

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setLoadError(undefined);
    try {
      const value = await call(api, (client) => client["library.getNote"]({ fileId }));
      if (active.current && generation.current === request) reset(value);
      return value;
    } catch (cause) {
      if (active.current && generation.current === request) setLoadError(cause);
      return undefined;
    } finally {
      if (active.current && generation.current === request) setLoading(false);
    }
  }, [api, fileId, reset]);

  // A serial save loop keeps edits made during a request and its returned revision together.
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (inflight.current) return inflight.current;
    if (conflict.current || !saved.current) return false;
    const operation = (async () => {
      while (saved.current && !conflict.current) {
        const current = {
          title: draft.current.title.trim() || "Untitled",
          markdown: draft.current.markdown,
        };
        const previous = saved.current;
        if (current.title === previous.title && current.markdown === previous.markdown) {
          if (active.current) setStatus("saved");
          return true;
        }
        if (active.current) setStatus("saving");
        try {
          const next = await call(api, (client) =>
            client["library.saveNote"]({
              fileId,
              title: current.title,
              markdown: current.markdown,
              baseRevision: previous.revision,
            }),
          );
          saved.current = next;
          if (active.current) {
            setStatus("saved");
            setSaveError(undefined);
          }
          invalidateLibrary(api, ["files", "folders", "notes"]);
        } catch (cause) {
          conflict.current =
            typeof cause === "object" &&
            cause !== null &&
            "_tag" in cause &&
            cause._tag === "Conflict";
          if (active.current) {
            setStatus(conflict.current ? "conflict" : "error");
            setSaveError(cause);
          }
          return false;
        }
      }
      return false;
    })();
    inflight.current = operation;
    try {
      return await operation;
    } finally {
      inflight.current = undefined;
    }
  }, [api, fileId]);

  const change = useCallback(
    (patch: Partial<{ title: string; markdown: string }>) => {
      draft.current = { ...draft.current, ...patch };
      if (patch.title !== undefined) setTitle(patch.title);
      if (patch.markdown !== undefined) setMarkdown(patch.markdown);
      if (!conflict.current) {
        setStatus("saving");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 800);
      }
    },
    [flush],
  );

  const keepMine = useCallback(async () => {
    try {
      const latest = await call(api, (client) => client["library.getNote"]({ fileId }));
      saved.current = latest;
      conflict.current = false;
      return flush();
    } catch (cause) {
      setSaveError(cause);
      setStatus("error");
      return false;
    }
  }, [api, fileId, flush]);

  useEffect(() => {
    active.current = true;
    void load();
    void call(api, (client) => client["library.recordFileEvent"]({ fileId, kind: "opened" })).catch(
      setSaveError,
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flush();
    });
    return () => {
      subscription.remove();
      clearTimeout(timer.current);
      void flush();
      active.current = false;
      generation.current++;
    };
  }, [api, fileId, flush, load]);
  return {
    file: file.data,
    note,
    title,
    markdown,
    loading,
    loadError: loadError ?? file.error,
    saveError,
    status,
    load,
    flush,
    change,
    keepMine,
  };
}

export function citedSourceCount(markdown: string) {
  return new Set(Array.from(markdown.matchAll(/\/sources\/([A-Za-z0-9_-]+)/g), (match) => match[1]))
    .size;
}
