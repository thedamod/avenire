import { expect, it, vi } from "vite-plus/test";
import type { ClientRuntime } from "@avenire/client-runtime/rpc";
import type { FileId, FolderId, ThreadId } from "@avenire/contracts";
import { rememberInitialThreadScope, takeInitialThreadScope } from "../../sources/threadScope";

const { fetchRequest } = vi.hoisted(() => ({ fetchRequest: vi.fn() }));
vi.mock("expo/fetch", () => ({ fetch: fetchRequest }));
vi.mock("react-native", () => ({ AppState: {}, useWindowDimensions: vi.fn() }));
vi.mock("../../../state/auth", () => ({
  apiUrl: "https://api.test",
  getCookieHeader: async () => ({ Cookie: "fixture-session" }),
}));
vi.mock("../../../lib/useRpc", () => ({ useQuery: vi.fn() }));
vi.mock("../../../state/api", () => ({ useApi: vi.fn() }));

import { createEntry } from "./data";
import { widgetHostDocument } from "./widgetProtocol";

it("carries source-selection scope into the actual SDK request and continuation", async () => {
  fetchRequest.mockImplementation(
    async () =>
      new Response(
        'data: {"type":"start","messageId":"reply"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } },
      ),
  );
  const api = {} as ClientRuntime;
  const threadId = "thread-selected" as ThreadId;
  const scope = {
    fileIds: ["file-selected" as FileId],
    folderIds: ["folder-selected" as FolderId],
  };
  rememberInitialThreadScope(api, threadId, scope);
  expect(takeInitialThreadScope({} as ClientRuntime, threadId)).toBeUndefined();
  const entry = createEntry(api, threadId);
  expect(takeInitialThreadScope(api, threadId)).toBeUndefined();
  await entry.chat.sendMessage({ text: "Explain this source" });
  await entry.chat.sendMessage({ text: "Continue" });
  expect(entry.chat.error).toBeUndefined();
  expect(fetchRequest).toHaveBeenCalledTimes(2);
  for (const [url, init] of fetchRequest.mock.calls) {
    expect(url).toBe("https://api.test/api/ruth/chat");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("cookie")).toBe("fixture-session");
    const request = JSON.parse(init.body);
    expect(request.scope).toEqual(scope);
    expect(request.threadId).toBe(threadId);
    expect(request.message.role).toBe("user");
    expect(request.messages).toBeUndefined();
  }
});

it("keeps authenticated widget HTML inside the script-only iframe", () => {
  const html = '<!doctype html><meta http-equiv="Content-Security-Policy" content="connect-src none"><script>window.parent.postMessage({type:"avenire:widget:ready"},"*")</script>';
  const host = widgetHostDocument("https://api.test/a/widget", 'Figure "quoted"', false, html);
  expect(host).toContain('sandbox="allow-scripts"');
  expect(host).toContain('srcdoc="&lt;!doctype html&gt;');
  expect(host).not.toContain('src="https://api.test/a/widget"');
  expect(host).not.toContain("fixture-session");
  expect(host).not.toContain('sandbox="allow-scripts allow-same-origin"');
});
