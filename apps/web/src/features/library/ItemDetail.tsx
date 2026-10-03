"use client";

import type { Item } from "@avenire/contracts";
import { Badge } from "@avenire/ui/components/badge";
import { useEffect, useState } from "react";
import { useStream } from "~/lib/rpc";

export function ItemDetail({
  item,
  onClose,
}: {
  readonly item: Item;
  readonly onClose: () => void;
}) {
  const [ingestionStatus, setIngestionStatus] = useState("Waiting for a live status update");
  useEffect(() => setIngestionStatus("Waiting for a live status update"), [item.id]);
  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      if (job.itemId === item.id) setIngestionStatus(job.status);
    },
    `item-detail-ingestion-${item.id}`,
  );

  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-auto border-l border-border bg-background p-5 shadow-md"
      aria-label="Item details"
    >
      <button className="mb-5 text-sm text-muted-foreground underline" onClick={onClose}>
        Close
      </button>
      <h2 className="text-lg font-semibold">{item.title}</h2>
      <div className="mt-3 flex gap-2">
        <Badge variant="outline">{item.kind}</Badge>
        <Badge variant="secondary">{item.placement}</Badge>
      </div>
      <dl className="mt-6 grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-1 break-all">
            {item.sourceUrl ? (
              <a className="underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
                {item.sourceUrl}
              </a>
            ) : (
              "No source link"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ingestion</dt>
          <dd className="mt-1">{ingestionStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Added</dt>
          <dd className="mt-1">{new Date(item.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
    </aside>
  );
}
