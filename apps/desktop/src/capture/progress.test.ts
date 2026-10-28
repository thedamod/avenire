import { expect, it, vi } from "vite-plus/test";
import { CaptureProgressStream } from "./progress.ts";

it("starts pending, sequences parallel progress, ignores terminal regressions, and replays in order", () => {
  const send = vi.fn();
  const started = {
    id: "capture",
    items: [{ key: "a", title: "Study", kind: "pdf", status: "pending" as const }],
  };
  const stream = new CaptureProgressStream(started, send);
  expect(send).toHaveBeenNthCalledWith(1, "avenire:capture-started", started);
  stream.progress({ key: "a", status: "uploading" });
  stream.progress({ key: "late", status: "pending", title: "Late source", kind: "document" });
  stream.progress({ key: "a", status: "saved" });
  stream.progress({ key: "late", status: "failed", reason: "Reconnect and capture again." });
  stream.progress({ key: "a", status: "pending" });
  stream.progress({ key: "a", status: "failed" });
  expect(stream.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
  expect(stream.events.map((event) => event.id)).toEqual(Array(4).fill("capture"));
  expect(stream.settled("a")).toBe(true);
  const replay = vi.fn();
  stream.replay(replay);
  expect(replay.mock.calls).toEqual(send.mock.calls);
});
