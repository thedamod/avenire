/** Client-safe preview contract. Keep browser/process dependencies out of tool specs. */
import * as Schema from "effect/Schema";

export const PreviewImage = Schema.Struct({
  id: Schema.String,
  data: Schema.String,
  mediaType: Schema.Literal("image/png"),
  sizeBytes: Schema.Int,
  width: Schema.Int,
  height: Schema.Int,
});
export const PreviewConsole = Schema.Struct({
  level: Schema.String,
  text: Schema.String,
  source: Schema.String,
  afterAction: Schema.optionalKey(Schema.String),
});
export const PreviewError = Schema.Struct({
  kind: Schema.String,
  message: Schema.String,
  stack: Schema.optionalKey(Schema.String),
  afterAction: Schema.optionalKey(Schema.String),
});
export const PreviewResult = Schema.Struct({
  ok: Schema.Boolean,
  width: Schema.Int,
  appearance: Schema.Literals(["light", "dark"]),
  contentHeight: Schema.Int,
  overflowX: Schema.Boolean,
  screenshots: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      image: Schema.Struct({
        ...PreviewImage.fields,
        // The existing transport sends a single contact sheet. Individual states
        // refer to their pixel regions, avoiding base64 in the model's text report.
        data: Schema.optionalKey(Schema.String),
        sheetId: Schema.optionalKey(Schema.String),
        region: Schema.optionalKey(
          Schema.Struct({ x: Schema.Int, y: Schema.Int, width: Schema.Int, height: Schema.Int }),
        ),
      }),
    }),
  ),
  console: Schema.Array(PreviewConsole),
  errors: Schema.Array(PreviewError),
  interactions: Schema.Array(
    Schema.Struct({
      ref: Schema.String,
      role: Schema.String,
      name: Schema.String,
      action: Schema.String,
      value: Schema.optionalKey(Schema.String),
      changedText: Schema.Boolean,
      error: Schema.optionalKey(Schema.String),
    }),
  ),
  accessibility: Schema.Array(Schema.Struct({ ref: Schema.String, message: Schema.String })),
  summary: Schema.String,
  // Compatibility with the existing image transport and same-thread repair policy.
  screenshot: Schema.optionalKey(PreviewImage),
  consoleMessages: Schema.Array(Schema.Struct({ level: Schema.String, text: Schema.String })),
});
export type PreviewReport = typeof PreviewResult.Type;
