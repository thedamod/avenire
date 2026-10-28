import { hashBlob } from "@avenire/shared/sha256";
const worker = globalThis as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<Blob>) => void) => void;
  postMessage: (value: { hash?: string; error?: string }, transfer: Transferable[]) => void;
};
// Native digest is ~4x faster than the incremental hash; only bound memory for large files.
const NATIVE_MAX_BYTES = 64 * 1024 * 1024;
const hex = (digest: ArrayBuffer) =>
  [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const hash = async (file: Blob) =>
  file.size <= NATIVE_MAX_BYTES && globalThis.crypto?.subtle
    ? hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))
    : hashBlob(file);
worker.addEventListener("message", (event) => {
  void hash(event.data).then(
    (digest) => worker.postMessage({ hash: digest }, []),
    () => worker.postMessage({ error: "Could not prepare this file." }, []),
  );
});
