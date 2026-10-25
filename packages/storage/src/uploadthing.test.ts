import { it } from "@effect/vitest";
import { afterEach, describe, expect, vi } from "vite-plus/test";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { StorageKey } from "@avenire/contracts";

import { ObjectNotFound, Storage, StorageLive } from "./storage.ts";

const provider = vi.hoisted(() => ({ getFileUrls: vi.fn() }));
vi.mock("files-sdk/uploadthing", async (importOriginal) => {
  const { uploadthing } = await importOriginal<typeof import("files-sdk/uploadthing")>();
  return {
    uploadthing: (options: Parameters<typeof uploadthing>[0]) => {
      const adapter = uploadthing(options);
      adapter.raw.getFileUrls = provider.getFileUrls;
      vi.spyOn(adapter.raw, "generateSignedURL").mockImplementation(async (key, options) => ({
        ufsUrl: `https://app.ufs.sh/f/${key}?expires=${options?.expiresIn}&signature=test`,
      }));
      return adapter;
    },
  };
});

const key = StorageKey.make("users/student/files/summary/source/note.md");
const fileKey = "provider-file-key.md";
const config = (acl: "private" | "public-read") =>
  ConfigProvider.fromUnknown({
    STORAGE_DRIVER: "uploadthing",
    UPLOADTHING_ACL: acl,
    UPLOADTHING_TOKEN: Buffer.from(
      JSON.stringify({ apiKey: "test-key", appId: "app", regions: ["sea1"] }),
    ).toString("base64"),
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("UploadThing reads", () => {
  for (const acl of ["public-read", "private"] as const)
    it.effect(`reads slash-containing customIds using resolved file keys (${acl})`, () => {
      provider.getFileUrls.mockResolvedValue({
        data: [{ key: fileKey, url: `https://app.ufs.sh/f/${fileKey}` }],
      });
      const fetch = vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input);
        // Reproduce the provider: customId URLs fail even though the object exists.
        if (url.pathname !== `/f/${fileKey}`) return new Response(null, { status: 404 });
        const ranged = !!init?.headers;
        return new Response(init?.method === "HEAD" ? null : ranged ? "note" : "# note", {
          status: ranged ? 206 : 200,
          headers: { "content-type": "text/markdown", "content-length": ranged ? "4" : "6" },
        });
      });
      vi.stubGlobal("fetch", fetch);
      return Effect.gen(function* () {
        const storage = yield* Storage;
        expect(new TextDecoder().decode(yield* storage.get(key))).toBe("# note");
        expect(yield* storage.head(key)).toMatchObject({ size: 6, contentType: "text/markdown" });
        const url = yield* storage.signedDownloadUrl(key, 600);
        expect(new URL(url).pathname).toBe(`/f/${fileKey}`);
        expect(new URL(url).searchParams.has("signature")).toBe(acl === "private");
        const range = yield* Effect.promise(() =>
          storage.files.download(key, { as: "stream", range: { start: 2, end: 5 } }),
        );
        expect(range.key).toBe(key);
        expect(yield* Effect.promise(() => new Response(range.stream()).text())).toBe("note");
        expect(fetch.mock.calls.at(-1)?.[1]?.headers).toEqual({ Range: "bytes=2-5" });
        expect(yield* Effect.promise(() => storage.files.exists(key))).toBe(true);
        expect(provider.getFileUrls).toHaveBeenCalledExactlyOnceWith(key, { keyType: "customId" });
      }).pipe(
        Effect.provide(StorageLive),
        Effect.provideService(ConfigProvider.ConfigProvider, config(acl)),
      );
    });

  it.effect("does not cache a missing resolution and distinguishes missing files", () => {
    provider.getFileUrls.mockResolvedValue({ data: [] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("# note")),
    );
    return Effect.gen(function* () {
      const storage = yield* Storage;
      expect(yield* storage.get(key).pipe(Effect.flip)).toBeInstanceOf(ObjectNotFound);
      provider.getFileUrls.mockResolvedValue({
        data: [{ key: fileKey, url: `https://app.ufs.sh/f/${fileKey}` }],
      });
      expect(new TextDecoder().decode(yield* storage.get(key))).toBe("# note");
      expect(provider.getFileUrls).toHaveBeenCalledTimes(5);
    }).pipe(
      Effect.provide(StorageLive),
      Effect.provideService(ConfigProvider.ConfigProvider, config("public-read")),
    );
  });
});
