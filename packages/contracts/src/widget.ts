import * as Schema from "effect/Schema";

import { AssetId } from "./ids.ts";

export const Widget = Schema.Struct({
  assetId: AssetId,
  url: Schema.String,
  title: Schema.String,
});
export type Widget = typeof Widget.Type;

export const WIDGET_PATH_PREFIX = "/w/";
export const MAX_WIDGET_HTML_BYTES = 512_000;
