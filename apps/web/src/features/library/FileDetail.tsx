"use client";

import { call } from "@avenire/client-runtime/rpc";
import type { LibraryFile } from "@avenire/contracts";
import { Badge } from "@avenire/ui/components/badge";
import { useEffect, useState } from "react";
import { useApi, useStream } from "~/lib/rpc";

export function FileDetail({
  file,
  onClose,
}: {
  readonly file: LibraryFile;
  readonly onClose: () => void;
}) {
  const api = useApi();
  useEffect(() => {
    void call(api, (client) =>
      client["library.recordFileEvent"]({ fileId: file.id, kind: "opened" }),
    ).catch(() => {});
  }, [api, file.id]);
  const [ingestionStatus, setIngestionStatus] = useState("Waiting for a live status update");
  useEffect(() => setIngestionStatus("Waiting for a live status update"), [file.id]);
  useStream(
    (client) => client["library.watchIngestion"](),
    (job) => {
      if (job.fileId === file.id) setIngestionStatus(job.status);
    },
    `file-detail-ingestion-${file.id}`,
  );

  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-auto border-l border-border bg-background p-5 shadow-md"
      aria-label="File details"
    >
      <button className="mb-5 text-sm text-muted-foreground underline" onClick={onClose}>
        Close
      </button>
      <h2 className="text-lg font-semibold">{file.title}</h2>
      <div className="mt-3 flex gap-2">
        <Badge variant="outline">{file.kind}</Badge>
        <Badge variant="secondary">{file.placement}</Badge>
      </div>
      <dl className="mt-6 grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-1 break-all">
            {file.sourceUrl ? (
              <a className="underline" href={file.sourceUrl} target="_blank" rel="noreferrer">
                {file.sourceUrl}
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
          <dd className="mt-1">{new Date(file.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
    </aside>
  );
}
