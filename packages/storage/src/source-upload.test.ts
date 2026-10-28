import { expect, it, vi } from "@effect/vitest";
import { Files, FilesError } from "files-sdk";
import { memory } from "files-sdk/memory";
import { prepareSourceUpload } from "./source-upload.ts";

it("delegates size-bound signed targets to the SDK for PUT and POST providers", async () => {
  const files = new Files({ adapter: memory() });
  Object.defineProperty(files, "capabilities", { value: { signedUrl: { supported: true } } });
  const sign = vi.spyOn(files, "signedUploadUrl");
  for (const target of [
    {
      method: "PUT" as const,
      url: "https://bucket.test/source",
      headers: { "content-type": "video/mp4" },
    },
    {
      method: "POST" as const,
      url: "https://bucket.test",
      fields: { key: "source", policy: "signed" },
    },
  ]) {
    sign.mockResolvedValueOnce(target);
    expect(
      await prepareSourceUpload(files, "source", {
        sizeBytes: 42,
        contentType: "video/mp4",
        expiresInSeconds: 60,
      }),
    ).toEqual(target);
    expect(sign).toHaveBeenLastCalledWith("source", {
      contentType: "video/mp4",
      minSize: 42,
      maxSize: 42,
      expiresIn: 60,
    });
  }
  sign.mockRejectedValueOnce(new FilesError("Provider", "Size-bound presigning is unsupported"));
  expect(
    await prepareSourceUpload(files, "source", {
      sizeBytes: 42,
      contentType: "video/mp4",
      expiresInSeconds: 60,
    }),
  ).toBeNull();
  sign.mockRejectedValueOnce(new FilesError("Unauthorized", "Denied"));
  await expect(
    prepareSourceUpload(files, "source", {
      sizeBytes: 42,
      contentType: "video/mp4",
      expiresInSeconds: 60,
    }),
  ).rejects.toThrow("Denied");
});

it("uses the relay when the adapter cannot sign uploads", async () => {
  const files = new Files({ adapter: memory() });
  const sign = vi.spyOn(files, "signedUploadUrl");
  expect(
    await prepareSourceUpload(files, "source", {
      sizeBytes: 42,
      contentType: "video/mp4",
      expiresInSeconds: 60,
    }),
  ).toBeNull();
  expect(sign).not.toHaveBeenCalled();
});
