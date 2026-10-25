import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { call, type ClientRuntime } from "@avenire/client-runtime/rpc";
import type { ThreadId } from "@avenire/contracts";
import { ThreadChat } from "./chatStore";

vi.mock("@avenire/client-runtime/rpc", () => ({ call: vi.fn(), invalidate: vi.fn() }));
vi.mock("./pageContext.ts", () => ({ measurePage: vi.fn() }));

const saved = (text: string) => [
  { id: "message", role: "user", parts: [{ type: "text", text }], metadata: null },
];
const makeEntry = () => new ThreadChat({} as ClientRuntime, "test", "thread" as ThreadId, () => {});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(call).mockReset();
});

describe("cached chat history", () => {
  it("deduplicates prefetch and navigation, then refreshes stale idle messages", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
    vi.mocked(call).mockResolvedValueOnce(saved("first"));
    const entry = makeEntry();
    const pending = entry.hydrate();
    expect(entry.hydrate()).toBe(pending);
    await pending;
    expect(entry.hydrated).toBe(true);
    await entry.hydrate();
    expect(call).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(140_000);
    vi.mocked(call).mockResolvedValueOnce(saved("updated elsewhere"));
    const refresh = entry.hydrate();
    expect(entry.chat.messages[0]?.parts).toEqual([{ type: "text", text: "first" }]);
    await refresh;
    expect(entry.chat.messages[0]?.parts).toEqual([{ type: "text", text: "updated elsewhere" }]);
  });

  it("never overwrites messages changed while history was in flight", async () => {
    let resolve!: (value: ReturnType<typeof saved>) => void;
    vi.mocked(call).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const entry = makeEntry();
    const pending = entry.hydrate();
    entry.chat.messages = [
      { id: "local", role: "user", parts: [{ type: "text", text: "new turn" }] },
    ];
    resolve(saved("old history"));
    await pending;
    expect(entry.chat.messages[0]?.id).toBe("local");
  });

  it("does not fetch or replace a streaming conversation", async () => {
    const entry = makeEntry();
    vi.spyOn(entry.chat, "status", "get").mockReturnValue("streaming");
    await entry.hydrate();
    expect(call).not.toHaveBeenCalled();
  });

  it("retries a failed prefetch when the page requests history", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("offline"));
    const entry = makeEntry();
    await expect(entry.hydrate()).rejects.toThrow("offline");
    expect(entry.hydrated).toBe(false);
    vi.mocked(call).mockResolvedValueOnce(saved("retry"));
    await entry.hydrate();
    expect(entry.hydrated).toBe(true);
  });
});
