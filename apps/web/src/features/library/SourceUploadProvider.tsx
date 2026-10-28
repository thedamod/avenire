"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { IngestionJob, LibraryFile } from "@avenire/contracts";
import { call, invalidateLibrary, updateLatestJob } from "@avenire/client-runtime/rpc";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { Progress } from "@avenire/ui/components/progress";
import { Check, CircleAlert, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useApi } from "~/lib/rpc";
import { SourceWorkQueue } from "@avenire/capture/work-queue";
import { useIngestionStream } from "./ingestionStream";
import { uploadSource } from "./uploadSource";
import { ingestionState, isPublishedPartialRetry } from "./ingestion";

type Entry = {
  id: string;
  name: string;
  file: File | null;
  stage: "waiting" | "preparing" | "uploading" | "saving" | "processing" | "failed";
  percent: number;
  source?: LibraryFile;
  job?: IngestionJob;
  error?: string | undefined;
};

type Uploads = {
  add: (files: readonly File[]) => void;
  show: () => void;
  count: number;
};
const UploadContext = createContext<Uploads | undefined>(undefined);
export function useSourceUploads() {
  const uploads = useContext(UploadContext);
  if (!uploads) throw new Error("Source uploads need SourceUploadProvider.");
  return uploads;
}

/** Lives with the app layout: changing tabs or opening a source does not interrupt transfers. */
export function SourceUploadProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const toastId = useId();
  const queue = useRef<Entry[]>([]);
  const transfers = useRef(new SourceWorkQueue());
  const scheduled = useRef(new Set<string>());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [visible, setVisible] = useState(false);

  const update = useCallback((id: string, patch: Partial<Entry>) => {
    setEntries((previous) =>
      previous.every(
        (entry) =>
          entry.id !== id ||
          Object.entries(patch).every(([key, value]) => entry[key as keyof Entry] === value),
      )
        ? previous
        : previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const drain = useCallback(async () => {
    const batch = queue.current.splice(0);
    await Promise.all(
      batch.map((entry) =>
        transfers.current.run(entry.file?.size ?? 0, async () => {
          const current = entry;
          if (!current.file) return;
          try {
            update(current.id, { stage: "preparing", percent: 0, error: undefined });
            // A shared preparation queue hashes one file at a time in a worker.
            const source = await uploadSource(current.file, {
              idempotencyKey: current.id,
              onStage: (stage) => update(current.id, { stage }),
              onProgress: (percent) => update(current.id, { percent }),
            });
            update(current.id, { stage: "processing", source, file: null, percent: 100 });
            invalidateLibrary(api, ["files", "folders"]);
          } catch (cause) {
            update(current.id, {
              stage: "failed",
              error: cause instanceof Error ? cause.message : "Upload failed. Try again.",
            });
          } finally {
            scheduled.current.delete(current.id);
          }
        }),
      ),
    );
  }, [api, update]);

  const add = useCallback(
    (files: readonly File[]) => {
      const batch = files.map((file): Entry => ({
        id: crypto.randomUUID(),
        name: file.name,
        file,
        stage: "waiting",
        percent: 0,
      }));
      if (!batch.length) return;
      setEntries((previous) => [...previous, ...batch]);
      for (const entry of batch) scheduled.current.add(entry.id);
      queue.current.push(...batch);
      setVisible(true);
      void drain();
    },
    [drain],
  );

  const retry = useCallback(
    (entry: Entry) => {
      if (entry.stage === "failed" && entry.file) {
        if (scheduled.current.has(entry.id)) return;
        scheduled.current.add(entry.id);
        update(entry.id, { stage: "waiting", error: undefined });
        queue.current.push(entry);
        void drain();
      } else if (entry.source) {
        const fileId = entry.source.id;
        void call(api, (client) => client["library.setIngestionPaused"]({ fileId, paused: false }))
          .then((job) => update(entry.id, { job }))
          .catch(() => toast.error("Couldn't restart processing. Try again from Sources."));
      }
    },
    [api, drain, update],
  );

  const clearFinished = useCallback(() => {
    setEntries((previous) => previous.filter((entry) => !entryStatus(entry).done));
  }, []);
  const show = useCallback(() => setVisible(true), []);
  const value = useMemo(() => ({ add, show, count: entries.length }), [add, show, entries.length]);

  const watching = entries.some(
    (entry) =>
      entry.stage === "processing" &&
      (!entry.job || ingestionState(entry.job, null)?.kind === "processing"),
  );

  useEffect(() => {
    if (!visible || !entries.length) {
      toast.dismiss(toastId);
      return;
    }
    toast.custom(
      () => (
        <UploadStatusToast
          entries={entries}
          onRetry={retry}
          onDismiss={() => setVisible(false)}
          onClear={clearFinished}
        />
      ),
      {
        id: toastId,
        position: "bottom-right",
        duration: Infinity,
        dismissible: false,
        unstyled: true,
        className: "source-upload-toast",
      },
    );
  }, [visible, entries, toastId, retry, clearFinished]);
  useEffect(
    () => () => {
      toast.dismiss(toastId);
    },
    [toastId],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      {watching ? (
        <UploadIngestionWatcher
          onJob={(job) => {
            if (
              ["indexed", "failed", "paused", "cancelled"].includes(job.status) &&
              entries.some((entry) => entry.source?.id === job.fileId)
            ) {
              invalidateLibrary(api, ["files", "folders"]);
            }
            setEntries((previous) => {
              let changed = false;
              const next = previous.map((entry) => {
                if (entry.source?.id !== job.fileId) return entry;
                const before = new Map(entry.job ? [[job.fileId, entry.job]] : []);
                if (updateLatestJob(before, job) === before) return entry;
                changed = true;
                return { ...entry, job };
              });
              return changed ? next : previous;
            });
          }}
        />
      ) : null}
    </UploadContext.Provider>
  );
}

function UploadIngestionWatcher({ onJob }: { onJob: (job: IngestionJob) => void }) {
  useIngestionStream(onJob);
  return null;
}

function entryStatus(entry: Entry) {
  if (entry.stage === "failed")
    return { label: entry.error ?? "Upload failed", failed: true, done: true };
  if (entry.stage === "processing") {
    if (!entry.job) return { label: "Waiting to read", failed: false, done: false };
    const state = ingestionState(entry.job, entry.source ?? null);
    if (state?.kind === "processing") return { label: state.label, failed: false, done: false };
    if (entry.job.status === "indexed" || isPublishedPartialRetry(entry.job))
      return {
        label:
          state || (entry.job.coverage && entry.job.coverage.status !== "full")
            ? "Saved · limited coverage"
            : "Ready",
        failed: false,
        done: true,
      };
    return {
      label:
        entry.job.error ??
        (entry.job.status === "paused" ? "Processing paused" : "Processing needs attention"),
      failed: true,
      done: true,
    };
  }
  const labels = {
    waiting: "Waiting to upload",
    preparing: "Preparing…",
    uploading: `Uploading · ${entry.percent}%`,
    saving: "100% transferred · Saving source…",
  };
  return { label: labels[entry.stage], failed: false, done: false };
}

function UploadStatusToast({
  entries,
  onRetry,
  onDismiss,
  onClear,
}: {
  entries: readonly Entry[];
  onRetry: (entry: Entry) => void;
  onDismiss: () => void;
  onClear: () => void;
}) {
  const complete = entries.filter((entry) => entryStatus(entry).done).length;
  return (
    <div className="w-[min(358px,calc(100vw-2rem))] overflow-hidden rounded-[10px] border border-border bg-popover text-popover-foreground">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <Upload className="size-4" aria-hidden="true" />
        <span className="flex-1 text-[13px] font-semibold">
          Uploads · {complete}/{entries.length} finished
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Hide upload status"
          className="size-11 md:size-7"
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <ul className="max-h-[min(320px,50dvh)] divide-y divide-border overflow-y-auto px-3.5">
        {entries.map((entry) => {
          const status = entryStatus(entry);
          return (
            <li key={entry.id} className="flex items-center gap-2.5 py-3">
              {status.done ? (
                status.failed ? (
                  <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )
              ) : (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]" title={entry.name}>
                  {entry.name}
                </p>
                <p
                  role={status.failed ? "alert" : "status"}
                  className={`mt-0.5 text-xs ${status.failed ? "text-destructive" : "text-foreground-soft"}`}
                >
                  {status.label}
                </p>
                {entry.stage === "uploading" ? (
                  <Progress
                    aria-label={`Uploading ${entry.name}`}
                    value={entry.percent}
                    className="mt-1.5"
                  />
                ) : null}
              </div>
              {status.failed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 md:h-7"
                  aria-label={`Retry ${entry.name}`}
                  onClick={() => onRetry(entry)}
                >
                  Try again
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        {complete ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-11 md:h-7">
            Clear finished
          </Button>
        ) : (
          <span>Uploads continue while you browse.</span>
        )}
        <Link
          href="/?tab=sources"
          onClick={onDismiss}
          className={buttonVariants({ variant: "link", size: "sm", className: "h-11 md:h-7" })}
        >
          Sources
        </Link>
      </div>
    </div>
  );
}
