/**
 * Binary WebSocket frames that carry file bytes read in the browser (PDF, Office, Google export).
 *
 * Layout: [u32 big-endian header length][UTF-8 JSON header][payload bytes]. A file is a run of
 * frames with increasing `seq`; the last has `final: true`. The receiver checks the total size and
 * SHA-256 against the `PageSnapshot.file` it announced before trusting the bytes.
 */
export interface FileFrameHeader {
  readonly requestId: string;
  readonly tabId: number;
  readonly sha256: string;
  readonly seq: number;
  readonly final: boolean;
}

/** Chunk size the extension sends; well under Chrome's WebSocket message limits. */
export const FILE_FRAME_BYTES = 256 * 1024;
const MAX_HEADER_BYTES = 1024;

export function encodeFileFrame(header: FileFrameHeader, payload: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const frame = new Uint8Array(4 + json.byteLength + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, json.byteLength);
  frame.set(json, 4);
  frame.set(payload, 4 + json.byteLength);
  return frame;
}

/** Returns undefined for anything malformed; the caller drops the socket's pending file. */
export function decodeFileFrame(
  frame: Uint8Array,
): { readonly header: FileFrameHeader; readonly payload: Uint8Array } | undefined {
  if (frame.byteLength < 4) return undefined;
  const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0);
  if (length === 0 || length > MAX_HEADER_BYTES || 4 + length > frame.byteLength) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(frame.subarray(4, 4 + length)),
    );
  } catch {
    return undefined;
  }
  const header = value as Partial<FileFrameHeader> | null;
  if (
    typeof header?.requestId !== "string" ||
    header.requestId.length === 0 ||
    header.requestId.length > 200 ||
    !Number.isSafeInteger(header.tabId) ||
    header.tabId! < 0 ||
    typeof header.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(header.sha256) ||
    !Number.isSafeInteger(header.seq) ||
    header.seq! < 0 ||
    typeof header.final !== "boolean"
  )
    return undefined;
  return {
    header: {
      requestId: header.requestId,
      tabId: header.tabId!,
      sha256: header.sha256,
      seq: header.seq!,
      final: header.final,
    },
    payload: frame.subarray(4 + length),
  };
}
