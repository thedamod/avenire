import * as Schema from "effect/Schema";

import { AssetId } from "./ids.ts";

export const Widget = Schema.Struct({
  assetId: AssetId,
  url: Schema.String,
  title: Schema.String,
});
export type Widget = typeof Widget.Type;

export const WIDGET_PATH_PREFIX = "/w/";
/** Built figures travel from the sandbox to storage without entering model context. */
export const MAX_WIDGET_HTML_BYTES = 8 * 1024 * 1024;
export const MAX_WIDGET_INLINE_HTML_BYTES = 512_000;
export const WidgetSource = Schema.Union([
  Schema.Struct({ html: Schema.String, path: Schema.optionalKey(Schema.Never) }),
  Schema.Struct({ path: Schema.NonEmptyString, html: Schema.optionalKey(Schema.Never) }),
]);
export type WidgetSource = typeof WidgetSource.Type;
