import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ErrorState, Skeleton } from "../../../ui";
import { assetUrl, decodeWidgetMessage, themeMessage } from "./widgetProtocol";

/** Same sandbox and source-checked messages as web WidgetFrame, for the orchestrator's web pass. */
export function WidgetView({ url, title, initialHeight = 240, onResize }: { url: string; title: string; initialHeight?: number; onResize?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  let source: string | undefined;
  try { source = assetUrl(url); } catch { /* Render the invalid-address error below. */ }
  useEffect(() => {
    setReady(false); setError(undefined); setHeight(initialHeight);
    const receive = (event: MessageEvent) => {
      if (!frame.current?.contentWindow || event.source !== frame.current.contentWindow) return;
      const message = decodeWidgetMessage(event.data);
      if (message?.type === "avenire:widget:ready") { setReady(true); frame.current.contentWindow.postMessage(themeMessage, "*"); }
      if (message?.type === "avenire:widget:height") setHeight(Math.max(40, Math.min(1200, message.height)));
      if (message?.type === "avenire:widget:error") setError(message.message || "This visual couldn't load.");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [url, attempt, initialHeight]);
  useEffect(() => {
    if (ready || error || !source) return;
    const timeout = setTimeout(() => setError("This visual couldn't load."), 30_000);
    return () => clearTimeout(timeout);
  }, [ready, error, source, attempt]);
  useEffect(() => { onResize?.(); }, [height, onResize]);
  if (error || !source) return <ErrorState message={error ?? "This visual has an invalid address."} onRetry={() => setAttempt((value) => value + 1)} />;
  return <View style={{ height, overflow: "hidden" }}>
    {!ready ? <View style={{ position: "absolute", inset: 12, pointerEvents: "none" }}><Skeleton /></View> : null}
    <iframe key={`${url}:${attempt}`} ref={frame} src={source} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="" style={{ width: "100%", height: "100%", border: 0, display: "block", colorScheme: "normal" }} onError={() => setError("This visual couldn't load.")} />
  </View>;
}
