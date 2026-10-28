import { hashBlob } from "@avenire/shared/sha256";
const worker = globalThis as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<Blob>) => void) => void;
  postMessage: (value: { hash?: string; error?: string }, transfer: Transferable[]) => void;
};
worker.addEventListener("message", (event) => {
  void hashBlob(event.data).then(
    (hash) => worker.postMessage({ hash }, []),
    () => worker.postMessage({ error: "Could not prepare this file." }, []),
  );
});
