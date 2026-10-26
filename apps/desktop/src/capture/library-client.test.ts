import { expect, it, vi } from "vite-plus/test";
import { captureLibraryClient } from "./library-client.ts";
import type { AvenireUploadFetch } from "./source-acquisition.ts";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const file = {
  id,
  kind: "pdf",
  title: "Study",
  placement: "inbox",
  source: "capture",
  tags: [],
  contentModifiedAt: null,
  archivedAt: null,
  sourceUrl: "https://example.com/study",
  storageKey: null,
  mimeType: "application/pdf",
  sizeBytes: 10,
  captureId: null,
  folderIds: [],
  origin: {
    _tag: "Web",
    url: "https://example.com/study",
    title: "Study",
    browser: "chrome",
    capturedAt: "2026-10-26T00:00:00Z",
  },
  access: "open",
  mediaPositionSec: null,
  preview: null,
  purgeAt: null,
  createdAt: "2026-10-26T00:00:00Z",
  updatedAt: "2026-10-26T00:00:00Z",
};

it("reads the owner's LibraryFile and records opened through the existing RPC transport", async () => {
  const messages: Array<{ tag: string; payload: unknown }> = [];
  const fetch = vi.fn<AvenireUploadFetch>(async (url, init) => {
    expect(url).toBe("https://app.test/api/rpc");
    const request = JSON.parse((await new Response(init.body).text()).trim());
    messages.push(request);
    return new Response(
      JSON.stringify({
        _tag: "Exit",
        requestId: request.id,
        exit: { _tag: "Success", value: request.tag === "library.getFile" ? file : null },
      }) + "\n",
      { headers: { "content-type": "application/ndjson" } },
    );
  });
  const client = captureLibraryClient("https://app.test", fetch);
  expect(await client.getFile(id)).toEqual(file);
  await client.opened(id);
  expect(messages.map((message) => ({ tag: message.tag, payload: message.payload }))).toEqual([
    { tag: "library.getFile", payload: { fileId: id } },
    { tag: "library.recordFileEvent", payload: { fileId: id, kind: "opened" } },
  ]);
});
