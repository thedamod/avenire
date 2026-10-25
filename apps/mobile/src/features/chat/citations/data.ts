import type { FileId, ThreadId } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { useQuery } from "../../../lib/useRpc";
import { collectCitations } from "./model";

/** Same metadata and signed-byte URL as the web SourceViewer. No guessed storage URLs. */
export function useCitationSource(sourceId: FileId, threadId?: ThreadId) {
  return useQuery(
    (client) =>
      Effect.gen(function* () {
        const file = yield* client["library.getFile"]({ fileId: sourceId });
        // The PDF preview needs the signed URL; without it the sheet shows a retryable error
        // instead of failing the whole citation. Passages only add the highlight.
        const contentUrl = client["library.getFileContentUrl"]({ fileId: sourceId });
        const content = file.storageKey
          ? yield* file.kind === "pdf"
              ? contentUrl.pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("PDF content URL unavailable", cause).pipe(
                      Effect.as(undefined),
                    ),
                  ),
                )
              : contentUrl
          : undefined;
        const messages = threadId
          ? yield* client["ruth.listMessages"]({ threadId }).pipe(
              Effect.catch((cause) =>
                Effect.logWarning("Citation passages unavailable", cause).pipe(
                  Effect.as([] as const),
                ),
              ),
            )
          : [];
        return { file, content, citations: collectCitations(messages) };
      }),
    `mobile-citation-${sourceId}-${threadId ?? ""}`,
  );
}
