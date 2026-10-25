"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parseCitation } from "~/features/sources/citation";
import { ViewerLoading } from "~/features/sources/ViewerLoading";
import { previewContentUrl } from "./model";

const PdfView = dynamic(() => import("~/features/sources/PdfView"), {
  ssr: false,
  loading: () => <ViewerLoading label="Loading PDF" />,
});

function notifyNative(type: "ready" | "error", message?: string) {
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (message: string) => void };
    }
  ).ReactNativeWebView;
  // eslint-disable-next-line unicorn/require-post-message-target-origin -- This is React Native's one-argument bridge, not Window.postMessage.
  bridge?.postMessage(JSON.stringify({ type: `avenire:source-preview:${type}`, message }));
}

/** A document-only host for the native sheet; signed bytes require no web session or RPC. */
export function SourceEmbed({ fileId }: { fileId: string }) {
  const params = useSearchParams();
  const target = parseCitation(new URLSearchParams(params.toString()));
  const [source, setSource] = useState<{ url: string | null }>();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const update = () => {
      const url = previewContentUrl(window.location.hash);
      setError(null);
      setSource({ url });
      if (url) notifyNative("ready");
      else notifyNative("error", "This PDF could not be opened. Reopen the source to try again.");
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <main
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-surface-3 text-foreground"
      aria-label="PDF preview"
    >
      {!source ? (
        <ViewerLoading label="Loading PDF" />
      ) : !source.url || error ? (
        <div role="alert" className="flex flex-col gap-3 p-5 text-sm text-foreground-soft">
          <p>{error ?? "This PDF could not be opened. Reopen the source to try again."}</p>
          {source.url ? (
            <button
              type="button"
              className="min-h-11 self-start rounded-md border border-border px-4"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <PdfView
          key={`${fileId}:${attempt}`}
          url={source.url}
          {...target}
          compact
          onError={(message) => {
            setError(message);
            notifyNative("error", message);
          }}
        />
      )}
    </main>
  );
}
