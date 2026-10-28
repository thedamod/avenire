import { useEffect, useState } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { WebView } from "react-native-webview";
import { ErrorState, Skeleton } from "../../../ui";
import { decodeWidgetMessage, widgetHostDocument } from "./widgetProtocol";
import { assetRequest } from "../../../lib/assetRequest";
import { apiUrl, getCookieHeader } from "../../../state/auth";

export function WidgetView({ url, title, initialHeight = 240, onResize }: { url: string; title: string; initialHeight?: number; onResize?: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return <WidgetAttempt key={`${url}:${attempt}`} url={url} title={title} initialHeight={initialHeight} onResize={onResize} retry={() => setAttempt((value) => value + 1)} />;
}

function WidgetAttempt({ url, title, initialHeight, onResize, retry }: { url: string; title: string; initialHeight: number; onResize?: (() => void) | undefined; retry: () => void }) {
  const [height, setHeight] = useState(initialHeight);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const reducedMotion = useReducedMotion();
  const [document, setDocument] = useState<{ html?: string; error?: string }>({});
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      const source = await assetRequest(url, apiUrl, getCookieHeader);
      const response = await fetch(source.uri, { headers: source.headers, credentials: "omit", signal: abort.signal });
      if (!response.ok) throw new Error("This visual couldn't load.");
      const html = await response.text();
      if (!abort.signal.aborted) setDocument({ html: widgetHostDocument(url, title, reducedMotion, html) });
    })().catch(() => { if (!abort.signal.aborted) setDocument({ error: "This visual couldn't load." }); });
    return () => abort.abort();
  }, [url, title, reducedMotion]);
  useEffect(() => {
    if (ready || error || document.error) return;
    const timeout = setTimeout(() => setError("This visual couldn't load."), 30_000);
    return () => clearTimeout(timeout);
  }, [ready, error, document.error]);
  useEffect(() => { onResize?.(); }, [height, onResize]);
  if (error || document.error) return <View style={{ padding: 12 }}><ErrorState message={error ?? document.error ?? "This visual couldn't load."} onRetry={retry} /></View>;
  return <View style={{ height, overflow: "hidden" }}>
    {!ready ? <View pointerEvents="none" style={{ position: "absolute", inset: 12, zIndex: 1, gap: 12 }}><Skeleton /><Skeleton width="65%" /></View> : null}
    {document.html ? <WebView source={{ html: document.html }} accessibilityLabel={title} style={{ flex: 1, backgroundColor: "#0E0E0E" }}
      javaScriptEnabled scrollEnabled={false} originWhitelist={["*"]} setSupportMultipleWindows={false} javaScriptCanOpenWindowsAutomatically={false}
      sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
      onShouldStartLoadWithRequest={(request) => !request.isTopFrame || request.url === "about:blank" || request.url.startsWith("about:blank#")}
      onError={() => setError("This visual couldn't load.")} onHttpError={() => setError("This visual couldn't load.")}
      onMessage={(event) => {
        let raw: unknown;
        try { raw = JSON.parse(event.nativeEvent.data); } catch { return; }
        const message = decodeWidgetMessage(raw);
        if (message?.type === "avenire:widget:height") setHeight(Math.max(40, Math.min(1200, message.height)));
        if (message?.type === "avenire:widget:ready") setReady(true);
        if (message?.type === "avenire:widget:error") setError(message.message || "This visual couldn't load.");
      }} /> : null}
  </View>;
}
