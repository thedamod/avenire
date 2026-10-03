"use client";

import { useState, useSyncExternalStore } from "react";
import type { Cluster, IngestionJob, Item } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { Badge } from "@avenire/ui/components/badge";
import { Button } from "@avenire/ui/components/button";
import { useApi, useQuery, useStream, errorMessage } from "~/lib/rpc";
import { getCaptureReceipt, subscribeCaptureReceipt } from "~/features/capture/receipt";

export function InboxPage() {
  const api = useApi();
  const {
    data: items,
    loading,
    error,
    refetch,
  } = useQuery((client) => client["library.listItems"]({ placement: "inbox" }), "inbox-items");
  const { data: clusters } = useQuery(
    (client) => client["library.listClusters"](),
    "inbox-clusters",
  );
  const [jobsById, setJobsById] = useState<ReadonlyMap<IngestionJob["id"], IngestionJob>>(
    () => new Map(),
  );
  const [selected, setSelected] = useState<ReadonlySet<Item["id"]>>(() => new Set());
  const [clusterIds, setClusterIds] = useState<ReadonlyArray<Cluster["id"]>>([]);
  const [actionError, setActionError] = useState<string>();
  const receipt = useSyncExternalStore(subscribeCaptureReceipt, getCaptureReceipt, () => undefined);

  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => setJobsById((previous) => new Map(previous).set(job.id, job)),
    "inbox-ingestion-watch",
    (cause) => setActionError(`Live updates stopped: ${errorMessage(cause)}`),
  );
  async function fileSelected() {
    if (clusterIds.length === 0) {
      setActionError("Choose at least one cluster.");
      return;
    }
    setActionError(undefined);
    try {
      await Promise.all(
        [...selected].map((itemId) =>
          call(api, (client) => client["library.fileItem"]({ itemId, clusterIds })),
        ),
      );
      setSelected(new Set());
      await refetch();
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  async function togglePause(itemId: Item["id"], paused: boolean) {
    try {
      const job = await call(api, (client) =>
        client["library.setIngestionPaused"]({ itemId, paused }),
      );
      setJobsById((previous) => new Map(previous).set(job.id, job));
    } catch (cause) {
      setActionError(errorMessage(cause));
    }
  }

  function toggleItem(itemId: Item["id"]) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
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
            {receipt.items.map((item) => (
              <li key={item.id}>Captured: {item.title}</li>
            ))}
            {receipt.skipped.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                Skipped {item.title}: {item.reason}
              </li>
            ))}
            {receipt.blocked.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                Blocked {item.title}: {item.category}
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
            value={clusterIds}
            onChange={(event) =>
              setClusterIds(
                Array.from(event.target.selectedOptions).flatMap(
                  (option) => clusters?.find((cluster) => cluster.id === option.value)?.id ?? [],
                ),
              )
            }
          >
            {clusters?.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>
                {cluster.name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void fileSelected()} disabled={selected.size === 0}>
          File {selected.size || "selected"} items
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
      {!loading && items?.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Your inbox is clear. New captures will show up here.
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {items?.map((item) => {
          const job = [...jobsById.values()].find((entry) => entry.itemId === item.id);
          const status = job?.status ?? "queued";
          return (
            <li key={item.id} className="flex items-center gap-3 py-4">
              <input
                type="checkbox"
                aria-label={`Select ${item.title}`}
                checked={selected.has(item.id)}
                onChange={() => toggleItem(item.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
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
                  onClick={() => void togglePause(item.id, status !== "paused")}
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
