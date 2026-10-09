"use client";

import * as Option from "effect/Option";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@avenire/ui/lib/utils";
import { decodeWidgetMessage, WIDGET_IFRAME_SANDBOX } from "./protocol.ts";

export interface WidgetFrameProps {
  url: string;
  title: string;
  colorScheme: "light" | "dark";
  tokens: Readonly<Record<string, string>>;
  initialHeight?: number;
  maxHeight?: number;
  loadTimeoutMs?: number;
  className?: string;
  onError?: (message: string) => void;
}

export function WidgetFrame(props: WidgetFrameProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <FrameAttempt
      key={`${props.url}:${attempt}`}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
    />
  );
}

function FrameAttempt({
  url,
  title,
  colorScheme,
  tokens,
  initialHeight = 320,
  maxHeight = 1200,
  loadTimeoutMs = 10_000,
  className,
  onError,
  retry,
}: WidgetFrameProps & { retry: () => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const failed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [height, setHeight] = useState(initialHeight);
  const [error, setError] = useState<string | null>(null);
  const fail = useCallback(
    (message: string) => {
      if (failed.current) return;
      failed.current = true;
      clearTimeout(timer.current);
      setError(message);
      onError?.(message);
    },
    [onError],
  );
  const postTheme = useCallback(
    () =>
      frameRef.current?.contentWindow?.postMessage(
        { type: "avenire:theme", colorScheme, tokens },
        "*",
      ),
    [colorScheme, tokens],
  );

  // Register during the commit: a cached document may post ready before passive effects.
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      const source = frameRef.current?.contentWindow;
      if (!source || event.source !== source || failed.current) return;
      const decoded = decodeWidgetMessage(event.data);
      if (Option.isNone(decoded)) return;
      switch (decoded.value.type) {
        case "avenire:widget:height":
          setHeight(Math.max(40, Math.min(Math.max(40, maxHeight), decoded.value.height)));
          break;
        case "avenire:widget:ready":
          ready.current = true;
          clearTimeout(timer.current);
          postTheme();
          break;
        case "avenire:widget:error":
          fail(decoded.value.message || "This visual couldn't load.");
          break;
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [postTheme, maxHeight, fail]);

  useEffect(() => {
    if (ready.current || failed.current) return;
    timer.current = setTimeout(() => fail("This visual couldn't load."), loadTimeoutMs);
    return () => clearTimeout(timer.current);
  }, [loadTimeoutMs, fail]);

  // React delegates iframe errors, but native error events do not bubble.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const handleError = () => fail("This visual couldn't load.");
    frame?.addEventListener("error", handleError);
    return () => frame?.removeEventListener("error", handleError);
  }, [fail]);

  useEffect(() => {
    if (ready.current && !failed.current) postTheme();
  }, [postTheme]);

  return (
    <div
      role="figure"
      aria-label={title}
      data-slot="widget-frame"
      className={cn("overflow-hidden rounded-md border border-border bg-card", className)}
      style={{ height }}
    >
      {error !== null ? (
        <div
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-3 p-4 text-sm"
        >
          <p className="font-medium text-card-foreground">{title}</p>
          <p className="text-muted-foreground">{error}</p>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      ) : (
        <iframe
          ref={frameRef}
          src={url}
          title={title}
          sandbox={WIDGET_IFRAME_SANDBOX}
          referrerPolicy="no-referrer"
          loading="lazy"
          allow=""
          className="block h-full"
          style={{ width: "100%", border: 0, colorScheme: "normal" }}
          onError={() => fail("This visual couldn't load.")}
        />
      )}
    </div>
  );
}
