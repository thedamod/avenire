import { PairingAuthority } from "./pairing.ts";
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { latestTabs, startTabsReceiver, stopTabsReceiver, tabsReceiverAvailable } from "./tabs.ts";
vi.mock("../config.ts", () => ({
  extensionReceiverPort: 0,
  extensionIds: new Set(["gdegpabcfhonkcnecpgaekplbfmopace"]),
}));
afterEach(() => {
  stopTabsReceiver();
  vi.restoreAllMocks();
});
const origin = "chrome-extension://gdegpabcfhonkcnecpgaekplbfmopace";
const tab = {
  url: "https://example.com/lecture",
  title: "Lecture",
  tabId: 1,
  windowId: 1,
  browser: "chrome",
  activeInWindow: true,
  engagement: { dwellMs: 10_000, scrollDepthPct: 0, mediaPlaying: false },
};
async function receiver() {
  const pairing = new PairingAuthority("/unused");
  pairing.setOwner("owner");
  pairing.setToken("owner", "A".repeat(43));
  const server = startTabsReceiver(pairing);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No receiver address");
  return (body: unknown, source = origin) =>
    fetch(`http://127.0.0.1:${address.port}/tabs`, {
      method: "POST",
      headers: { origin: source, "content-type": "application/json" },
      body: JSON.stringify(
        Array.isArray(body)
          ? body
          : {
              _tag: "TabsReport",
              version: 1,
              auth: { _tag: "Token", token: "A".repeat(43) },
              ...(body as object),
            },
      ),
    });
}

it("accepts reference reports, merges profiles, drops incognito and expires stale tab data", async () => {
  const post = await receiver();
  expect(tabsReceiverAvailable()).toBe(true);
  expect(
    (
      await post({
        senderId: "profile-a",
        browser: "Chrome",
        tabs: [tab, { ...tab, incognito: true }],
      })
    ).status,
  ).toBe(204);
  expect(
    (await post({ senderId: "profile-b", tabs: [{ ...tab, url: "https://example.com/second" }] }))
      .status,
  ).toBe(204);
  expect(latestTabs()).toHaveLength(2);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 10_001);
  expect(latestTabs()).toEqual([]);
});

it("rejects page/foreign extension origins and malformed reports", async () => {
  const post = await receiver();
  for (const source of [
    "https://example.com",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "null",
  ])
    expect((await post([tab], source)).status).toBe(403);
  expect((await post({ senderId: "profile-a", tabs: [{ url: "broken" }] })).status).toBe(400);
  expect((await post([tab])).status).toBe(400);
  expect(latestTabs()).toHaveLength(0);
});
