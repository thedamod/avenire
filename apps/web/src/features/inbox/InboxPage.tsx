"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FileId, Folder, IngestionJob, LibraryFile } from "@avenire/contracts";
import { call, invalidateLibrary, pruneJobs, updateLatestJob } from "@avenire/client-runtime/rpc";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { useApi, useQuery, useStream, errorMessage } from "~/lib/rpc";
import { getCaptureReceipt, subscribeCaptureReceipt } from "~/features/capture/receipt";

export function InboxPage() {
  const api = useApi();
  const {
    data: files,
    loading,
    error,
    refetch,
  } = useQuery((client) => client["library.listFiles"]({ placement: "inbox" }), "inbox-files");
  const { data: folders } = useQuery((client) => client["library.listFolders"](), "inbox-folders");
  const [jobsByFile, setJobsByFile] = useState<ReadonlyMap<FileId, IngestionJob>>(() => new Map());
  const visibleFiles = useMemo(
    () => (files ? new Set(files.map((file) => file.id)) : undefined),
    [files],
  );
  useEffect(() => {
    if (visibleFiles) setJobsByFile((previous) => pruneJobs(previous, visibleFiles));
  }, [visibleFiles]);
  const [selected, setSelected] = useState<ReadonlySet<LibraryFile["id"]>>(() => new Set());
  const [folderIds, setFolderIds] = useState<ReadonlyArray<Folder["id"]>>([]);
  const [actionError, setActionError] = useState<string>();
  const receipt = useSyncExternalStore(subscribeCaptureReceipt, getCaptureReceipt, () => undefined);

  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      setJobsByFile((previous) => updateLatestJob(previous, job, visibleFiles));
      if (job.status === "indexed") invalidateLibrary(api);
    },
    "inbox-ingestion-watch",
    (cause) => setActionError(`Live updates stopped: ${errorMessage(cause)}`),
  );
  async function fileSelected() {
    if (folderIds.length === 0) {
      setActionError("Choose at least one cluster.");
      return;
    }
    setActionError(undefined);
    try {
      await Promise.all(
        [...selected].map((fileId) =>
          call(api, (client) => client["library.placeFile"]({ fileId, folderIds })),
        ),
      );
      setSelected(new Set());
      invalidateLibrary(api);
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function togglePause(fileId: LibraryFile["id"], paused: boolean) {
    try {
      const job = await call(api, (client) =>
        client["library.setIngestionPaused"]({ fileId, paused }),
      );
      setJobsByFile((previous) => updateLatestJob(previous, job, visibleFiles));
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  function toggleFile(fileId: LibraryFile["id"]) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  return (
    <section className="mx-auto max-w-5xl p-6">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <Button variant="outline" onClick={() => void refetch()}>
          Refresh
        </Button>
      </header>
      {receipt ? (
        <section className="my-5 border border-border p-4">
          <h2 className="font-medium">
            Latest capture · {new Date(receipt.capturedAt).toLocaleString()}
          </h2>
          <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {receipt.files.map((file) => (
              <li key={file.id}>Captured: {file.title}</li>
            ))}
            {receipt.skipped.map((file, index) => (
              <li key={`${file.title}-${index}`}>
                Skipped {file.title}: {file.reason}
              </li>
            ))}
            {receipt.blocked.map((file, index) => (
              <li key={`${file.title}-${index}`}>
                Blocked {file.title}: {file.category}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="my-5 flex flex-wrap items-end gap-3 border-b border-border pb-5">
        <label className="grid gap-1 text-sm">
          File selected into
          <select
            className="h-9 min-w-56 border border-input bg-background px-2"
            multiple
            value={folderIds}
            onChange={(event) =>
              setFolderIds(
                Array.from(event.target.selectedOptions).flatMap(
                  (option) => folders?.find((folder) => folder.id === option.value)?.id ?? [],
                ),
              )
            }
          >
            {folders?.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void fileSelected()} disabled={selected.size === 0}>
          File {selected.size || "selected"} files
        </Button>
      </div>
      {loading ? <p className="py-8 text-sm text-muted-foreground">Loading inbox…</p> : null}
      {error ? (
        <p role="alert" className="py-4 text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="py-2 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {!loading && files?.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Your inbox is clear. New captures will show up here.
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {files?.map((file) => {
          const job = jobsByFile.get(file.id);
          const status = job?.status ?? "queued";
          return (
            <li key={file.id} className="flex items-center gap-3 py-4">
              <input
                type="checkbox"
                aria-label={`Select ${file.title}`}
                checked={selected.has(file.id)}
                onChange={() => toggleFile(file.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.title}</p>
                <p className="text-sm text-muted-foreground">
                  {status}
                  {job?.error ? ` · ${job.error}` : ""}
                </p>
              </div>
              <Badge variant={status === "failed" ? "destructive" : "outline"}>{status}</Badge>
              {job && !["indexed", "failed", "cancelled"].includes(status) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void togglePause(file.id, status !== "paused")}
                >
                  {status === "paused" ? "Resume" : "Pause"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
