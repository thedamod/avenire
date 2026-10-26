import { expect, it } from "vite-plus/test";
import { decodeFileFrame, encodeFileFrame, type FileFrameHeader } from "./frames.ts";

const header: FileFrameHeader = {
  requestId: "r1",
  tabId: 7,
  sha256: "a".repeat(64),
  seq: 0,
  final: true,
};

it("round-trips a header and payload", () => {
  const payload = new Uint8Array([1, 2, 3]);
  const decoded = decodeFileFrame(encodeFileFrame(header, payload));
  expect(decoded?.header).toEqual(header);
  expect([...decoded!.payload]).toEqual([1, 2, 3]);
});

it("rejects truncated, oversized and malformed headers", () => {
  const frame = encodeFileFrame(header, new Uint8Array());
  expect(decodeFileFrame(frame.subarray(0, 6))).toBeUndefined();
  const huge = new Uint8Array(8);
  new DataView(huge.buffer).setUint32(0, 5000);
  expect(decodeFileFrame(huge)).toBeUndefined();
  expect(
    decodeFileFrame(encodeFileFrame({ ...header, sha256: "x" }, new Uint8Array())),
  ).toBeUndefined();
  expect(
    decodeFileFrame(encodeFileFrame({ ...header, seq: -1 }, new Uint8Array())),
  ).toBeUndefined();
});
