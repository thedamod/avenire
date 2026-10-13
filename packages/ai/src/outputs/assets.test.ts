import { AssetId, CloudRunId, ThreadId, UserId } from "@avenire/contracts";
import { Storage } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { ctx, testCrypto } from "../tools/test-support.ts";
import { AssetStoreTest } from "./asset-test-support.ts";
import {
  AssetStore,
  authorizeAsset,
  assetKind,
  assetMediaType,
  safeAssetName,
  signAssetToken,
  verifyAssetToken,
} from "./assets.ts";

it("permanent asset tokens reject tampering, noncanonical encodings and other signing domains", () => {
  const id = AssetId.make("asset-id");
  const token = signAssetToken(id, "secret");
  expect(verifyAssetToken(token, "secret")).toEqual(Option.some(id));
  for (const bad of [
    "",
    `${token}.extra`,
    token.replace(".", "=."),
    `../${token}`,
    token.replace(/.$/, "!"),
    signAssetToken(id, "other"),
  ])
    expect(Option.isNone(verifyAssetToken(bad, "secret"))).toBe(true);
});
it("authorization is owner-only even with a valid link", () => {
  expect(authorizeAsset({ userId: ctx.userId, visibility: "private" }, ctx.userId)).toBe(true);
  expect(authorizeAsset({ userId: ctx.userId, visibility: "private" }, UserId.make("other"))).toBe(
    false,
  );
});
it("infers media and kinds and preserves safe Unicode filenames", () => {
  expect(assetKind(assetMediaType("plot.PNG"))).toBe("image");
  expect(assetKind(assetMediaType("movie.mp4"))).toBe("video");
  expect(assetKind(assetMediaType("notes.pdf"))).toBe("pdf");
  expect(assetKind(assetMediaType("unknown"))).toBe("file");
  expect(safeAssetName("../../a\\..\\Δ plot.png")).toBe("Δ plot.png");
  expect(safeAssetName(".../")).toBe("asset");
  expect(Array.from(safeAssetName(`${"Δ".repeat(200)}.pdf`)).length).toBe(160);
});
it.effect("stores bytes and hash in the hidden prefix and keeps links after years", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    const bytes = new Uint8Array([0, 1, 255]);
    const entry = yield* assets.put(ctx.userId, {
      name: "../../plot.png",
      bytes,
      mediaType: "image/png",
      threadId: ThreadId.make("thread"),
      runId: CloudRunId.make("run"),
    });
    expect(entry.storageKey).toMatch(
      new RegExp(`^users/${ctx.userId}/\\.avenire/assets/[0-9a-f]{12}/plot\\.png$`),
    );
    expect(entry).toMatchObject({
      kind: "image",
      visibility: "private",
      sizeBytes: 3,
      threadId: "thread",
      runId: "run",
    });
    expect(entry.contentHash).toHaveLength(64);
    expect(entry.url).toContain("https://app.test/a/");
    expect(yield* assets.load(entry)).toEqual(bytes);
    yield* TestClock.adjust("3650 days");
    expect(assets.resolve(entry.url.split("/a/")[1]!)).toEqual(Option.some(entry.id));
    expect(yield* assets.get(entry.id)).toEqual(Option.some(entry));
    expect(yield* (yield* Storage).list(entry.storageKey)).toHaveLength(1);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);
it.effect("lists only the owner's assets with combined thread and run filters", () =>
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    const input = { name: "report.pdf", bytes: new Uint8Array(), mediaType: "application/pdf" };
    const first = yield* assets.put(ctx.userId, {
      ...input,
      threadId: ThreadId.make("thread"),
      runId: CloudRunId.make("run"),
    });
    yield* assets.put(ctx.userId, { ...input, threadId: ThreadId.make("other-thread") });
    yield* assets.put(UserId.make("other"), { ...input, threadId: ThreadId.make("thread") });
    const listed = yield* assets.list(ctx.userId, {
      threadId: ThreadId.make("thread"),
      runId: CloudRunId.make("run"),
    });
    expect(listed.map((x) => x.id)).toEqual([first.id]);
    expect(listed[0]).not.toHaveProperty("storageKey");
    expect(listed[0]).not.toHaveProperty("userId");
    expect(yield* assets.get(AssetId.make("missing"))).toEqual(Option.none());
  }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);
