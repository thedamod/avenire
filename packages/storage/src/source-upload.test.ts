import { afterEach, expect, it, vi } from "@effect/vitest";
import { prepareUploadThingSource } from "./source-upload.ts";
afterEach(() => vi.unstubAllGlobals());
it("binds signing to size, type and custom ID and rejects a mismatched capability", async () => {
  const token = Buffer.from(JSON.stringify({ apiKey: "test" })).toString("base64");
  const key = "users/u/source";
  // Match UploadThing's wire format: it encodes the custom ID before URLSearchParams does.
  const url = new URL("https://sea1.ingest.uploadthing.com/physical");
  url.search = new URLSearchParams({
    "x-ut-custom-id": encodeURIComponent(key),
    "x-ut-file-size": "5",
  }).toString();
  const fetcher = vi.fn().mockResolvedValue(Response.json({ key: "physical", url: url.href }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await prepareUploadThingSource(
      token,
      key,
      { sizeBytes: 5, contentType: "video/mp4", expiresInSeconds: 60 },
      "private",
    ),
  ).toEqual({ key: "physical", url: url.href });
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
    fileSize: 5,
    fileType: "video/mp4",
    customId: key,
    acl: "private",
  });
  fetcher.mockResolvedValue(
    Response.json({ key: "physical", url: url.href.replace("size=5", "size=50") }),
  );
  await expect(
    prepareUploadThingSource(
      token,
      key,
      { sizeBytes: 5, contentType: "video/mp4", expiresInSeconds: 60 },
      "private",
    ),
  ).rejects.toThrow("Unexpected storage");
  const wrongOwner = new URL(url);
  wrongOwner.searchParams.set("x-ut-custom-id", encodeURIComponent("users/other/source"));
  fetcher.mockResolvedValue(Response.json({ key: "physical", url: wrongOwner.href }));
  await expect(
    prepareUploadThingSource(
      token,
      key,
      { sizeBytes: 5, contentType: "video/mp4", expiresInSeconds: 60 },
      "private",
    ),
  ).rejects.toThrow("Unexpected storage");
});
