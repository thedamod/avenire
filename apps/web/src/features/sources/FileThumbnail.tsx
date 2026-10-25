"use client";
import { useEffect, useRef, useState } from "react";
import type { LibraryFile } from "@avenire/contracts";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { call } from "@avenire/client-runtime/rpc";
import { FileKindIcon } from "~/components/app";
import { useApi } from "~/lib/rpc";
// Blobs avoid keeping signed URLs or live PDF documents in the shared cache.
const cache = new Map<string, Blob>();
function remember(key: string, blob: Blob) {
  cache.delete(key);
  cache.set(key, blob);
  while (cache.size > 48) cache.delete(cache.keys().next().value!);
}
export function FileThumbnail({ file, size = 48 }: { file: LibraryFile; size?: number }) {
  const api = useApi();
  const root = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { rootMargin: "200px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near || !file.storageKey || !["pdf", "image", "video"].includes(file.kind)) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let task: PDFDocumentLoadingTask | undefined;
    let render: RenderTask | undefined;
    let video: HTMLVideoElement | undefined;
    const key = `${file.id}:${file.updatedAt}:${size}`;
    const show = (blob: Blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    };
    void (async () => {
      const cached = cache.get(key);
      if (cached) {
        show(cached);
        return;
      }
      const content = await call(api, (client) =>
        client["library.getFileContentUrl"]({ fileId: file.id }),
      );
      if (controller.signal.aborted) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const edge = Math.min(384, Math.max(32, size * 2));
      if (file.kind === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        if (controller.signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({ url: content.url });
        const pdf = await task.promise;
        if (controller.signal.aborted) return;
        const page = await pdf.getPage(1);
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: edge / Math.max(original.width, original.height),
        });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        render = page.render({ canvas, canvasContext: context, viewport });
        await render.promise;
      } else if (file.kind === "image") {
        const response = await fetch(content.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Thumbnail unavailable");
        const bitmap = await createImageBitmap(await response.blob());
        try {
          const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
          canvas.width = Math.max(1, bitmap.width * scale);
          canvas.height = Math.max(1, bitmap.height * scale);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        } finally {
          bitmap.close();
        }
      } else {
        // Avoid downloading large videos just to decorate a row.
        if (!file.sizeBytes || file.sizeBytes > 20 * 1024 * 1024) return;
        video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.preload = "metadata";
        video.muted = true;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Poster timed out")), 5000);
          const done = () => {
            clearTimeout(timeout);
            resolve();
          };
          video!.addEventListener("loadeddata", done, { once: true });
          video!.addEventListener(
            "error",
            () => {
              clearTimeout(timeout);
              reject(new Error("Poster unavailable"));
            },
            { once: true },
          );
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
          video!.src = content.url;
        });
        canvas.width = edge;
        canvas.height = (edge * video.videoHeight) / video.videoWidth;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      if (controller.signal.aborted) return;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.8),
      );
      if (blob && !controller.signal.aborted) {
        remember(key, blob);
        show(blob);
      }
    })()
      .catch(() => {
        /* Keep the file icon for unsupported bytes or cross-origin media. */
      })
      .finally(() => {
        void task?.destroy();
        if (video) {
          video.removeAttribute("src");
          video.load();
        }
      });
    return () => {
      controller.abort();
      render?.cancel();
      void task?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSrc(null);
    };
  }, [api, file.id, file.updatedAt, file.kind, file.storageKey, file.sizeBytes, near, size]);
  return (
    <span
      ref={root}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-3"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <FileKindIcon kind={file.kind} url={file.sourceUrl} size={Math.min(24, size / 2)} />
      )}
    </span>
  );
}
