/** Device acquisition transfers source bytes; OCR/transcription/indexing stays on the server. */
import * as Schema from "effect/Schema";
import { FileKind } from "./library.ts";

export const MAX_SOURCE_UPLOAD_BYTES = 256 * 1024 * 1024;
export const SourceUploadId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
).pipe(Schema.brand("SourceUploadId"));
export type SourceUploadId = typeof SourceUploadId.Type;
export const CreateSourceUpload = Schema.Struct({
  idempotencyKey: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  ),
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  kind: FileKind,
  mimeType: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(150)),
  sizeBytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_SOURCE_UPLOAD_BYTES })),
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/i)),
  /** Optional provenance only. The server drops query/fragment and rejects credentials. */
  sourceUrl: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});
export type CreateSourceUpload = typeof CreateSourceUpload.Type;
export const SourceUploadTicket = Schema.Struct({
  uploadId: SourceUploadId,
  uploadUrl: Schema.String,
  expiresAt: Schema.String,
  status: Schema.Literals(["pending", "uploading", "completed", "cancelled"]),
});
export type SourceUploadTicket = typeof SourceUploadTicket.Type;
export class SourceUploadError extends Schema.TaggedError<SourceUploadError>()(
  "SourceUploadError",
  {
    status: Schema.Int,
    message: Schema.String,
  },
) {}
