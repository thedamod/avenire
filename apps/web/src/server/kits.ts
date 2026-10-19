import { kitsDir } from "@avenire/widget-kit/kits-dir";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { WidgetHost, widgetHostDecision } from "./widgetHost.ts";
class KitReadError extends Schema.TaggedError<KitReadError>()("KitReadError", {
  cause: Schema.Defect(),
}) {}
const read = (name: string) =>
  Effect.tryPromise({
    try: () => readFile(`${kitsDir}${name}`),
    catch: (cause) => new KitReadError({ cause }),
  });
const Manifest = Schema.Record(
  Schema.String,
  Schema.Struct({ bytes: Schema.Int, sha256: Schema.String }),
);
export const kitsResponse = Effect.fn("WidgetKits.response")(
  function* (request: Request, path: ReadonlyArray<string>) {
    const policy = yield* WidgetHost;
    const url = new URL(request.url);
    if (
      widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !==
        "widget" ||
      path.length < 1 ||
      path.length > 2 ||
      path.some((p) => !/^[a-zA-Z0-9._-]+$/.test(p))
    )
      return new Response(null, { status: 404 });
    const manifestBytes = yield* read("manifest.json");
    const hash = createHash("sha256").update(manifestBytes).digest("hex");
    const manifest = yield* Effect.try({
      try: () => JSON.parse(manifestBytes.toString()) as unknown,
      catch: (cause) => new KitReadError({ cause }),
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Manifest)));
    const name = path.at(-1)!;
    if (!Object.hasOwn(manifest, name) || (path.length === 2 && path[0] !== hash))
      return new Response(null, { status: 404 });
    const common = {
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (path.length === 1)
      return new Response(null, {
        status: 307,
        headers: { ...common, "Cache-Control": "no-cache", Location: `/kits/${hash}/${name}` },
      });
    const bytes = yield* read(name);
    if (createHash("sha256").update(bytes).digest("hex") !== manifest[name]!.sha256)
      return new Response(null, { status: 503 });
    const mediaType = name.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : name.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/plain; charset=utf-8";
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...common,
        "Content-Type": mediaType,
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: `"${hash}:${manifest[name]!.sha256}"`,
      },
    });
  },
  Effect.catchTag("KitReadError", () => Effect.succeed(new Response(null, { status: 404 }))),
);
