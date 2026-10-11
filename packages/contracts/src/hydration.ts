/** Selectors and manifests for files copied into a Ruth Cloud workspace. */
import * as Schema from "effect/Schema";

import { CaptureId, FolderId, HydrationId, FileId } from "./ids.ts";
import { FileEventKind, FileKind, FileSource } from "./library.ts";

/** Parts combine with AND; `today` is evaluated in the run's time zone. */
export const FileSelector = Schema.Struct({
  time: Schema.optionalKey(
    Schema.Struct({
      /** ISO time bounds. */
      since: Schema.optionalKey(Schema.String),
      until: Schema.optionalKey(Schema.String),
      lastDays: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 })),
      ),
      today: Schema.optionalKey(Schema.Boolean),
      events: Schema.optionalKey(Schema.Array(FileEventKind)),
    }),
  ),
  topic: Schema.optionalKey(
    Schema.Struct({
      query: Schema.NonEmptyString,
      minRelevance: Schema.optionalKey(
        Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
      ),
    }),
  ),
  filters: Schema.optionalKey(
    Schema.Struct({
      kinds: Schema.optionalKey(Schema.Array(FileKind)),
      folderIds: Schema.optionalKey(Schema.Array(FolderId)),
      tags: Schema.optionalKey(Schema.Array(Schema.String)),
      sources: Schema.optionalKey(Schema.Array(FileSource)),
    }),
  ),
  explicit: Schema.optionalKey(
    Schema.Struct({
      fileIds: Schema.optionalKey(Schema.Array(FileId)),
      folderIds: Schema.optionalKey(Schema.Array(FolderId)),
      captureIds: Schema.optionalKey(Schema.Array(CaptureId)),
    }),
  ),
});
export type FileSelector = typeof FileSelector.Type;

export const HydrationLimits = Schema.Struct({
  maxFiles: Schema.optionalKey(Schema.Int),
  maxBytes: Schema.optionalKey(Schema.Int),
});
export type HydrationLimits = typeof HydrationLimits.Type;

export const HYDRATION_DEFAULTS = { maxFiles: 200, maxBytes: 1_073_741_824 } as const;
export const WORKSPACE_CAP_BYTES = 10 * 1024 ** 3;

export const HydrationRule = Schema.Struct({
  selector: FileSelector,
  ...HydrationLimits.fields,
});
export type HydrationRule = typeof HydrationRule.Type;

export const HydratedFile = Schema.Struct({
  fileId: FileId,
  /** `<folder or Inbox>/<title>.<ext>`. */
  drivePath: Schema.String,
  sandboxPath: Schema.String,
  size: Schema.Int,
  hash: Schema.String,
  reason: Schema.String,
  /** True when already present with the same hash. */
  skipped: Schema.Boolean,
});
export type HydratedFile = typeof HydratedFile.Type;

export const HydrationResult = Schema.Struct({
  hydrationId: HydrationId,
  files: Schema.Array(HydratedFile),
  totalBytes: Schema.Int,
  truncated: Schema.Struct({ byCount: Schema.Boolean, byBytes: Schema.Boolean }),
});
export type HydrationResult = typeof HydrationResult.Type;
