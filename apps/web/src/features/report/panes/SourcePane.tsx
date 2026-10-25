"use client";

import type { FileId } from "@avenire/contracts";

import { SourceViewer } from "~/features/sources/SourceViewer";
import type { CitationTarget } from "~/features/sources/citation";

/** A source in the pane or citation sheet, opened at the cited page, time or region (14a–c). */
export default function SourcePane({
  fileId,
  target,
}: {
  readonly fileId: FileId;
  readonly target: CitationTarget;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col pt-2">
      <SourceViewer
        key={`${fileId}:${target.page ?? ""}:${target.t ?? ""}`}
        fileId={fileId}
        page={target.page}
        t={target.t}
        region={target.region}
        q={target.q}
        compact
      />
    </div>
  );
}
