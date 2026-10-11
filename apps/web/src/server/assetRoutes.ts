import { AssetStore, authorizeAsset, safeAssetName } from "@avenire/ai/outputs/assets";
import { WidgetStore } from "@avenire/ai/outputs/widgets";
import { Storage, StorageError } from "@avenire/storage/storage";
import { WIDGET_RESPONSE_CSP } from "@avenire/ui/widget-protocol";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { attachmentDisposition } from "./http.ts";
import { requireUser } from "./session.ts";
import { WidgetHost, widgetHostDecision } from "./widgetHost.ts";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export const assetResponse = Effect.fn("Assets.response")(function* (
  request: Request,
  token: string,
) {
  const viewer = yield* requireUser(request);
  const assets = yield* AssetStore;
  const id = assets.resolve(token);
  if (Option.isNone(id)) return new Response(null, { status: 404, headers: privateHeaders });
  const found = yield* assets.get(id.value);
  if (Option.isNone(found) || !authorizeAsset(found.value, viewer))
    return new Response(null, { status: 404, headers: privateHeaders });
  const entry = found.value;
  const download = new URL(request.url).searchParams.get("download") === "1";
  if (entry.kind === "widget" && !download) {
    const widgets = yield* WidgetStore;
    return new Response(null, {
      status: 302,
      headers: { ...privateHeaders, Location: yield* widgets.url(entry) },
    });
  }
  const name = entry.storageKey.split("/").at(-1) ?? safeAssetName(entry.title);
  const disposition =
    download || entry.mediaType === "text/html" ? attachmentDisposition(name) : undefined;
  const storage = yield* Storage;
  // fs has no access-granting presigner. Serve authenticated bytes instead of exposing a file:// URL.
  if (storage.files.capabilities.signedUrl.supported) {
    const url = yield* Effect.tryPromise({
      try: () =>
        storage.files.url(entry.storageKey, {
          expiresIn: 600,
          ...(disposition ? { responseContentDisposition: disposition } : {}),
        }),
      catch: (cause) => new StorageError({ operation: "signedDownloadUrl", cause }),
    });
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: url } });
  }
  const bytes = yield* assets.load(entry);
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    {
      headers: {
        ...privateHeaders,
        "Content-Type": entry.mediaType,
        "Content-Length": String(bytes.byteLength),
        "Content-Security-Policy": "sandbox",
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      },
    },
  );
});

export const widgetResponse = Effect.fn("Widgets.response")(function* (
  request: Request,
  token: string,
) {
  const policy = yield* WidgetHost;
  const url = new URL(request.url);
  if (
    widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !==
    "widget"
  )
    return new Response(null, { status: 404 });
  const widgets = yield* WidgetStore;
  const bytes = yield* widgets.load(token);
  return new Response(new TextDecoder().decode(bytes), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": WIDGET_RESPONSE_CSP({
        kitsOrigin: widgets.origin,
        frameAncestors: widgets.frameAncestors,
      }),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store",
    },
  });
});
