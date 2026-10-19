import { ArtifactId, StorageKey, UserId } from "@avenire/contracts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { Database } from "@avenire/database/client";
import {
  ArtifactStore,
  ArtifactStoreLive,
  artifactKey,
  artifactMediaType,
  artifactPrefix,
  makeArtifactStore,
  safeArtifactName,
} from "./artifacts.ts";
import { ctx, fakeDatabase, testCrypto } from "./test-support.ts";

const settings = {
  appUrl: "https://app.test",
  secret: Redacted.make("artifact-test-secret"),
  listUserIds: (after?: string) => Effect.succeed(after === undefined ? [ctx.userId] : []),
};
it("lays out safe names under the user's expiration date", () => {
  expect(
    artifactKey(
      ctx.userId,
      ArtifactId.make("artifact"),
      "2026-10-16T12:00:00.000Z",
      "../../plot.png",
    ),
  ).toBe("users/user/.avenire/tmp/artifacts/2026-10-16/artifact/plot.png");
  expect(safeArtifactName("..\\folder\\file\n.svg")).toBe("file_.svg");
  expect(safeArtifactName("..")).toBe("artifact");
  expect(safeArtifactName("a".repeat(200) + ".png")).toMatch(/\.png$/);
  expect(safeArtifactName("a".repeat(200) + ".png")).toHaveLength(160);
  for (const [name, mediaType] of [
    ["x.PNG", "image/png"],
    ["x.jpg", "image/jpeg"],
    ["x.svg", "image/svg+xml"],
    ["x.gif", "image/gif"],
    ["x.webp", "image/webp"],
    ["x.mp4", "video/mp4"],
    ["x.webm", "video/webm"],
    ["x.pdf", "application/pdf"],
    ["x.csv", "text/csv"],
    ["x.json", "application/json"],
    ["x.txt", "text/plain"],
    ["x.md", "text/markdown"],
    ["x.html", "text/html"],
    ["x.bin", "application/octet-stream"],
    ["x.constructor", "application/octet-stream"],
    ["x.__proto__", "application/octet-stream"],
  ])
    expect(artifactMediaType(name!)).toBe(mediaType);
});
it.effect("stores bytes and validates signed capabilities, expiry and tampering", () =>
  Effect.gen(function* () {
    const store = yield* makeArtifactStore(settings);
    const bytes = new TextEncoder().encode("sample");
    const stored = yield* store.put(ctx.userId, {
      name: "sample.csv",
      bytes,
      mediaType: "text/csv",
    });
    const token = stored.url.split("/api/ruth/artifacts/")[1]!;
    expect(stored.key).toBe(
      artifactKey(ctx.userId, stored.artifactId, stored.expiresAt, "sample.csv"),
    );
    expect(yield* store.resolve(token)).toEqual(
      Option.some({ key: stored.key, expiresAt: stored.expiresAt, name: "sample.csv" }),
    );
    expect(yield* store.load(stored.key)).toEqual(bytes);
    const storage = yield* Storage;
    expect((yield* storage.head(stored.key)).contentType).toBe("text/csv");
    const [payload, signature] = token.split(".");
    const modified = Buffer.from(
      JSON.stringify({ userId: "other", key: stored.key, expiresAt: stored.expiresAt }),
    ).toString("base64url");
    for (const bad of [
      "",
      "invalid",
      `${modified}.${signature}`,
      `${payload}.AAAA`,
      `${token}.extra`,
      `${payload}=.${signature}`,
    ])
      expect(Option.isNone(yield* store.resolve(bad))).toBe(true);
    yield* TestClock.adjust("7 days");
    expect(Option.isNone(yield* store.resolve(token))).toBe(true);
  }).pipe(Effect.provide(StorageMemory), Effect.provideService(Crypto.Crypto, testCrypto)),
);

it.effect("sweeps only expired date folders, across batches and users", () =>
  Effect.gen(function* () {
    const users = [ctx.userId, UserId.make("user2")];
    const batches: Array<string | undefined> = [];
    const store = yield* makeArtifactStore({
      ...settings,
      listUserIds: (after) =>
        Effect.sync(() => {
          batches.push(after);
          return after === undefined ? [users[0]!] : after === users[0] ? [users[1]!] : [];
        }),
    });
    const storage = yield* Storage;
    const now = yield* DateTime.now;
    const today = DateTime.formatIsoDateUtc(now);
    const yesterday = DateTime.formatIsoDateUtc(DateTime.subtract(now, { days: 1 }));
    const keys = users.flatMap((id) => [
      `${artifactPrefix(id)}${yesterday}/a/old.txt`,
      `${artifactPrefix(id)}${today}/a/today.txt`,
      `${artifactPrefix(id)}2999-01-01/a/future.txt`,
      `${artifactPrefix(id)}not-a-date/a/keep.txt`,
      `${artifactPrefix(id)}1999-01-01-malformed/a/keep.txt`,
      `users/${id}/.avenire/widgets/widget.html`,
    ]);
    for (const key of keys) yield* storage.put(StorageKey.make(key), "data");
    const unknown = StorageKey.make(
      `${artifactPrefix(UserId.make("not-in-db"))}${yesterday}/a/keep.txt`,
    );
    yield* storage.put(unknown, "data");
    expect(yield* store.sweepExpired).toBe(2);
    expect(batches).toEqual([undefined, users[0], users[1]]);
    for (const key of keys)
      expect((yield* storage.get(StorageKey.make(key)).pipe(Effect.result))._tag).toBe(
        key.includes(`/${yesterday}/`) ? "Failure" : "Success",
      );
    expect(yield* storage.get(unknown)).toEqual(new TextEncoder().encode("data"));
  }).pipe(Effect.provide(StorageMemory)),
);

it.effect("falls back to widget signing when the dedicated secret is blank", () =>
  Effect.gen(function* () {
    const store = yield* ArtifactStore;
    const verifier = yield* makeArtifactStore({
      ...settings,
      secret: Redacted.make("widget-secret"),
    });
    const artifact = yield* store.put(ctx.userId, {
      name: "test.txt",
      bytes: new Uint8Array([1]),
      mediaType: "text/plain",
    });
    expect(
      Option.isSome(yield* verifier.resolve(artifact.url.split("/api/ruth/artifacts/")[1]!)),
    ).toBe(true);
  }).pipe(
    Effect.provide(ArtifactStoreLive),
    Effect.provide(StorageMemory),
    Effect.provideService(Database, fakeDatabase({})),
    Effect.provideService(Crypto.Crypto, testCrypto),
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          APP_URL: "https://app.test",
          ARTIFACT_SIGNING_SECRET: "",
          WIDGET_SIGNING_SECRET: "widget-secret",
        }),
      ),
    ),
  ),
);
