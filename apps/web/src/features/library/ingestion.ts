"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileId, IngestionJob, LibraryFile } from "@avenire/contracts";
import { call, invalidateLibrary, pruneJobs, updateLatestJob } from "@avenire/client-runtime/rpc";
import { toast } from "sonner";
import { addToLocalSet } from "~/lib/localSet";
import { errorMessage, useApi, useStream } from "~/lib/rpc";

import { ingestionState } from "./ingestionState";
export { ingestionState, isPublishedPartialRetry, type IngestionState } from "./ingestionState";

/**
 * Latest ingestion job per visible file, live. New captures (a job for a file we haven't
 * loaded) trigger one files refetch so they land at the top of the list.
 */
export function useIngestionJobs(files: readonly LibraryFile[] | undefined) {
  const api = useApi();
  const [allJobs, setJobs] = useState<ReadonlyMap<FileId, IngestionJob>>(() => new Map());
  const visible = useMemo(
    () => (files ? new Set(files.map((file) => file.id)) : undefined),
    [files],
  );
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  // Only files still on screen (trashed ones drop out).
  const jobs = useMemo(() => (visible ? pruneJobs(allJobs, visible) : allJobs), [allJobs, visible]);
  const requested = useRef(new Set<FileId>());
  const refresh = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(refresh.current), []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refresh.current);
    refresh.current = setTimeout(() => invalidateLibrary(api, ["files", "folders"]), 400);
  }, [api]);

  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      const known = visibleRef.current;
      if (known && !known.has(job.fileId)) {
        if (!requested.current.has(job.fileId)) {
          requested.current.add(job.fileId);
          scheduleRefresh();
        }
        return;
      }
      setJobs((previous) => {
        const before = previous.get(job.fileId);
        const next = updateLatestJob(previous, job);
        // A job we watched finish changes counts and placement (clustering files it).
        if (
          before &&
          ingestionState(before)?.kind === "processing" &&
          ingestionState(job)?.kind !== "processing"
        )
          scheduleRefresh();
        return next;
      });
    },
    "library-ingestion-watch",
  );

  const retry = useCallback(
    async (fileId: FileId) => {
      try {
        const job = await call(api, (client) =>
          client["library.setIngestionPaused"]({ fileId, paused: false }),
        );
        setJobs((previous) => updateLatestJob(previous, job));
      } catch (cause) {
        toast.error(`Couldn't retry: ${errorMessage(cause)}`);
      }
    },
    [api],
  );

  return { jobs, retry };
}

// Paywalled sources the user chose to keep stop showing under "Needs you".
export const KEPT_SOURCES = "avenire:kept-sources";

export function keepSource(fileId: FileId) {
  addToLocalSet(KEPT_SOURCES, [fileId]);
}
