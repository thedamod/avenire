/** Public documents are acquired anonymously; parsing and OCR run on the server. */
import type { FileKind } from "@avenire/contracts";
import * as Effect from "effect/Effect";

import { acquireSource } from "./acquisition.ts";
import { extractPdf } from "./pdf.ts";
import { mimeEssence, sniff } from "./resolve.ts";
import { ExtractionError, UnsupportedSource } from "./types.ts";
import { extractWeb } from "./web.ts";

const MAX_PUBLIC_DOCUMENT_BYTES = 50 * 1024 * 1024;

export const extractPublicDocument = Effect.fn("extractPublicDocument")(function* (
  url: string,
  kind: FileKind,
) {
  const source = yield* acquireSource(url, { maxBytes: MAX_PUBLIC_DOCUMENT_BYTES }).pipe(
    Effect.mapError((cause) =>
      cause.status === 401 || cause.status === 403
        ? new UnsupportedSource({
            kind,
            reason:
              "This URL requires access. Acquire the original on your device and upload it. Server acquisition never uses your session credentials.",
          })
        : new ExtractionError({ source: "public-document-fetch", cause }),
    ),
  );
  // Signatures take precedence: extensionless PDFs and misleading Content-Type headers work.
  if (sniff(source.bytes) === "pdf") return yield* extractPdf(source.bytes);
  const mime = mimeEssence(source.mimeType);
  const head = new TextDecoder().decode(source.bytes.subarray(0, 1024)).trimStart();
  if (kind === "pdf" || /\.pdf(?:[?#]|$)/i.test(url)) {
    return yield* new UnsupportedSource({
      kind,
      reason:
        "The URL did not return the original PDF. If access is required, acquire it on your device and upload the original bytes.",
    });
  }
  if (
    mime === "text/html" ||
    mime === "application/xhtml+xml" ||
    /^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/i.test(head)
  ) {
    return yield* extractWeb(url, source.bytes);
  }
  return yield* new UnsupportedSource({
    kind,
    reason:
      "The public URL did not return an HTML page or PDF. Upload the original bytes for other or authenticated documents.",
  });
});
