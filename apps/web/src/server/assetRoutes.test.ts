import { AssetId, UserId } from "@avenire/contracts";
import { AuthService } from "@avenire/auth/server";
import { AssetStore } from "@avenire/ai/outputs/assets";
import { WidgetStore, makeWidgetStore } from "@avenire/ai/outputs/widgets";
import { Storage } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { AssetStoreTest } from "../../../../packages/ai/src/outputs/asset-test-support.ts";
import { testCrypto } from "../../../../packages/ai/src/tools/test-support.ts";
import { assetResponse, widgetResponse } from "./assetRoutes.ts";
import { WidgetHost } from "./widgetHost.ts";
const owner = UserId.make("owner");
const session = (id: UserId | null) =>
  AuthService.of({
    auth: {} as AuthService["Service"]["auth"],
    getSession: () => Effect.succeed(id ? { id, name: "Test", email: "test@example.test" } : null),
  });
const WidgetsTest = Layer.effect(
  WidgetStore,
  makeWidgetStore({
    origin: "https://widgets.test",
    secret: Redacted.make("widget-secret"),
    frameAncestors: ["https://app.test"],
  }),
).pipe(Layer.provideMerge(AssetStoreTest));
const testLayer = WidgetsTest.pipe(Layer.provideMerge(Layer.succeed(Crypto.Crypto, testCrypto)));
const context = { userId: owner, agent: "ruth", fullAccess: false, timeZone: "UTC" } as const;
for (const [viewer, expected] of [
  [owner, 200],
  [UserId.make("other"), 404],
  [null, 401],
] as const)
  it.effect(`/a checks session and owner (${expected})`, () =>
    Effect.gen(function* () {
      const assets = yield* AssetStore;
      const entry = yield* assets.put(owner, {
        name: "figure.png",
        mediaType: "image/png",
        bytes: new Uint8Array([1, 2, 3]),
      });
      const response = yield* assetResponse(
        new Request(entry.url),
        entry.url.split("/a/")[1]!,
      ).pipe(
        Effect.provideService(AuthService, session(viewer)),
        Effect.catchTag("HttpRequestError", (error) =>
          Effect.succeed(new Response(null, { status: error.status })),
        ),
      );
      expect(response.status).toBe(expected);
      if (expected === 200) {
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(yield* Effect.promise(() => response.arrayBuffer())).toEqual(
          new Uint8Array([1, 2, 3]).buffer,
        );
      }
    }).pipe(Effect.provide(testLayer)),
  );
it.effect("download requests attach safe filenames; normal images remain inline", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    const entry = yield* assets.put(owner, {
      name: "Δ plot.png",
      mediaType: "image/png",
      bytes: new Uint8Array([1]),
    });
    const token = entry.url.split("/a/")[1]!;
    const response = yield* assetResponse(new Request(`${entry.url}?download=1`), token);
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(response.headers.get("Content-Disposition")).toContain("%CE%94%20plot.png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(
      (yield* assetResponse(new Request(entry.url), token)).headers.get("Content-Disposition"),
    ).toBeNull();
  }).pipe(Effect.provide(testLayer), Effect.provideService(AuthService, session(owner))),
);
it.effect("invalid and missing permanent tokens return 404", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    for (const token of ["invalid", assets.url({ id: AssetId.make("missing") }).split("/a/")[1]!])
      expect((yield* assetResponse(new Request(`https://app.test/a/${token}`), token)).status).toBe(
        404,
      );
  }).pipe(Effect.provide(testLayer), Effect.provideService(AuthService, session(owner))),
);
it.effect("widgets redirect to isolated short URLs and support HTML download", () =>
  Effect.gen(function* () {
    const widgets = yield* WidgetStore;
    const entry = yield* widgets.render(context, { title: "Chart", html: "<p>Chart</p>" });
    const token = entry.url.split("/a/")[1]!;
    const response = yield* assetResponse(new Request(entry.url), token);
    expect(response.status).toBe(302);
    const target = response.headers.get("Location")!;
    expect(target).toContain("https://widgets.test/w/");
    const loaded = yield* widgetResponse(new Request(target), target.split("/w/")[1]!);
    expect(loaded.headers.get("Content-Security-Policy")).toContain("https://widgets.test/kits/");
    expect(loaded.headers.get("Content-Security-Policy")).toContain("sandbox allow-scripts");
    expect(loaded.headers.get("Cache-Control")).toBe("private, no-store");
    const downloaded = yield* assetResponse(new Request(`${entry.url}?download=1`), token);
    expect(downloaded.headers.get("Content-Disposition")).toContain("attachment;");
    expect(downloaded.status).toBe(200);
    yield* TestClock.adjust("10 minutes");
    expect(
      yield* widgetResponse(new Request(target), target.split("/w/")[1]!).pipe(Effect.result),
    ).toMatchObject({ failure: { _tag: "ObjectNotFound" } });
    expect((yield* assetResponse(new Request(entry.url), token)).status).toBe(302);
  }).pipe(
    Effect.provide(testLayer),
    Effect.provideService(AuthService, session(owner)),
    Effect.provideService(WidgetHost, { host: "widgets.test" }),
  ),
);
it.effect("presigned redirects bind the attachment option and ten-minute lifetime", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    const storage = yield* Storage;
    const entry = yield* assets.put(owner, {
      name: "notes.pdf",
      mediaType: "application/pdf",
      bytes: new Uint8Array([1]),
    });
    let options: unknown;
    const files = Object.create(storage.files) as typeof storage.files;
    Object.defineProperty(files, "capabilities", { value: { signedUrl: { supported: true } } });
    files.url = async (_key, opts) => {
      options = opts;
      return "https://storage.test/presigned";
    };
    const response = yield* assetResponse(
      new Request(`${entry.url}?download=1`),
      entry.url.split("/a/")[1]!,
    ).pipe(Effect.provideService(Storage, { ...storage, files }));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://storage.test/presigned");
    expect(options).toMatchObject({
      expiresIn: 600,
      responseContentDisposition: expect.stringContaining("attachment;"),
    });
  }).pipe(Effect.provide(testLayer), Effect.provideService(AuthService, session(owner))),
);
it.effect("/w rejects wrong hosts and non-widget assets", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    const entry = yield* assets.put(owner, {
      name: "image.png",
      bytes: new Uint8Array(),
      mediaType: "image/png",
    });
    const target = yield* (yield* WidgetStore).url(entry);
    expect(
      (yield* widgetResponse(
        new Request(target.replace("widgets.test", "app.test")),
        target.split("/w/")[1]!,
      )).status,
    ).toBe(404);
    expect(
      yield* widgetResponse(new Request(target), target.split("/w/")[1]!).pipe(Effect.result),
    ).toMatchObject({ failure: { _tag: "ObjectNotFound" } });
    expect(Option.isSome(yield* assets.get(entry.id))).toBe(true);
  }).pipe(Effect.provide(testLayer), Effect.provideService(WidgetHost, { host: "widgets.test" })),
);
