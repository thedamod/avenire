import { describe, expect, it, vi } from "@effect/vitest";
import { sourceUploadUrl, transferDirectSource, requestSourceTicket } from "./source-transfer.ts";
import { SourceWorkQueue } from "./work-queue.ts";

const url = "https://sea1.ingest.uploadthing.com/file?signature=test";
describe("direct source transport", () => {
  it("retries an old server's transport-only schema rejection with the same upload identity", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Invalid request parameters (transport)." }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({ uploadId: "same" }));
    const payload = { transport: "direct", idempotencyKey: "same", sha256: "digest" };
    expect((await requestSourceTicket(send, payload)).ok).toBe(true);
    expect(send.mock.calls.map(([body]) => JSON.parse(body))).toEqual([
      payload,
      { idempotencyKey: "same", sha256: "digest" },
    ]);
    for (const status of [400, 403, 500]) {
      const other = vi
        .fn()
        .mockResolvedValue(Response.json({ error: "Invalid MIME type" }, { status }));
      await requestSourceTicket(other, payload);
      expect(other).toHaveBeenCalledTimes(1);
    }
  });
  it("resumes the same object at its accepted offset without application credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher
      .mockResolvedValueOnce(new Response(null, { headers: { "x-ut-range-start": "0" } }))
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(null, { headers: { "x-ut-range-start": "3" } }))
      .mockResolvedValueOnce(Response.json({ key: "file" }));
    await transferDirectSource(url, new Blob(["abcdef"]), { fetcher });
    expect(fetcher.mock.calls.map(([target]) => target)).toEqual([url, url, url, url]);
    expect(fetcher.mock.calls[3]![1]!.headers).toEqual({ Range: "bytes=3-" });
    const body = fetcher.mock.calls[3]![1]!.body as FormData;
    expect(await (body.get("file") as Blob).text()).toBe("def");
    for (const [, init] of fetcher.mock.calls)
      expect(init).toMatchObject({ credentials: "omit", redirect: "error" });
  });
  it("rejects unknown destinations, invalid offsets, and permanent failures", async () => {
    for (const value of [
      "http://sea1.ingest.uploadthing.com/f",
      "https://evil.test/f",
      "https://u:p@sea1.ingest.uploadthing.com/f",
    ])
      expect(() => sourceUploadUrl(value)).toThrow();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { headers: { "x-ut-range-start": "99" } }));
    await expect(transferDirectSource(url, new Blob(["abc"]), { fetcher })).rejects.toThrow(
      "offset",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(transferDirectSource(url, new Blob(["abc"]), { fetcher })).rejects.toThrow("403");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps a slot available for a document while videos wait", async () => {
    const queue = new SourceWorkQueue(3, 10);
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const block = (name: string) => async () => {
      started.push(name);
      await new Promise<void>((resolve) => releases.push(resolve));
    };
    const jobs = [
      queue.run(100, block("video1")),
      queue.run(100, block("video2")),
      queue.run(100, block("video3")),
    ];
    await queue.run(1, async () => {
      started.push("document");
    });
    expect(started).toEqual(["video1", "video2", "document"]);
    releases.shift()!();
    releases.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toContain("video3");
    releases.shift()!();
    await Promise.all(jobs);
  });
});
