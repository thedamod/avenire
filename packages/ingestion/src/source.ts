/** One bounded, private spool for a media job. It is shared by ffprobe and all ffmpeg work. */
import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { StorageError } from "@avenire/storage/storage";
import type { MediaSource } from "./extract/media.ts";

export const spoolMediaSource = (
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  expectedHash?: string,
) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async (signal) => {
        const directory = await mkdtemp(join(tmpdir(), "avenire-ingestion-"));
        const path = join(directory, "source");
        const file = await open(path, "wx", 0o600);
        const reader = stream.getReader();
        const hash = createHash("sha256");
        let sizeBytes = 0;
        let prefix = new Uint8Array(0);
        const abort = () => {
          void reader.cancel().catch(() => {});
        };
        signal.addEventListener("abort", abort, { once: true });
        try {
          for (;;) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            sizeBytes += value.byteLength;
            if (sizeBytes > maxBytes) throw new Error("Media source byte budget exceeded");
            if (prefix.length < 512) {
              const next = new Uint8Array(Math.min(512, prefix.length + value.length));
              next.set(prefix);
              next.set(value.subarray(0, next.length - prefix.length), prefix.length);
              prefix = next;
            }
            hash.update(value);
            await file.writeFile(value);
          }
          signal.throwIfAborted();
          if (!sizeBytes) throw new Error("Empty media source");
          const sha256 = hash.digest("hex");
          if (expectedHash && sha256 !== expectedHash)
            throw new Error("Stored source digest changed");
          return { source: { path, directory, sizeBytes } satisfies MediaSource, sha256, prefix };
        } catch (error) {
          await rm(directory, { recursive: true, force: true });
          throw error;
        } finally {
          signal.removeEventListener("abort", abort);
          await reader.cancel().catch(() => {});
          reader.releaseLock();
          await file.close();
        }
      },
      catch: (cause) => new StorageError({ operation: "spoolMedia", cause }),
    }),
    ({ source }) =>
      Effect.tryPromise(() => rm(source.directory, { recursive: true, force: true })).pipe(
        Effect.ignore({ log: "Warn", message: "Media source cleanup failed" }),
      ),
  );
