import { SheetError as ErrorState } from "./SheetError";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { useReducedMotion } from "react-native-reanimated";
import { useQuery } from "../../../lib/useRpc";
import { apiUrl, getCookieHeader } from "../../../state/auth";
import { colors } from "../../../theme/tokens";
import { Button, SkeletonRow, Text, errorMessage } from "../../../ui";

// Wire-compatible with packages/ui/src/widgets/protocol.ts and WidgetFrame.tsx.
// Asset HTML is already built with buildWidgetDocument/adaptFigureTheme on the server.
const theme = {
  type: "avenire:theme",
  colorScheme: "dark",
  tokens: {
    "--background": colors.bg,
    "--foreground": colors.fg,
    "--foreground-soft": colors["fg-2"],
    "--muted-foreground": colors["fg-3"],
    "--border": colors["line-2"],
    "--card": colors.sheet,
    "--primary": colors.fg,
    "--primary-foreground": colors.bg,
    "--ruth": colors.accent,
    "--ruth-text": colors["accent-text"],
    "--font-sans": "system-ui, sans-serif",
    "--font-mono": "ui-monospace, monospace",
    "--figure-page": "#0b0b0b",
    "--figure-card": "#131313",
    "--figure-text": "#a3a3a3",
    "--figure-strong": "#e6e6e6",
    "--figure-muted": "#6e6e6e",
    "--figure-paper": "#131313",
    "--figure-face": "#1b1b1b",
    "--figure-top": "#1c1c1c",
    "--figure-shade-0": "#0f0f0f",
    "--figure-shade-1": "#121212",
    "--figure-shade-2": "#151515",
    "--figure-shade-3": "#181818",
    "--figure-lit-top": "#262626",
    "--figure-lit-shade": "#1d1d1d",
    "--figure-hi": "#d4d4d4",
    "--figure-mid": "#6a6a6a",
    "--figure-lo": "#3e3e3e",
    "--figure-faint": "#2a2a2a",
    "--figure-lit": "#ffffff",
    "--figure-halo": "#050505",
    "--figure-halo-opacity": "0.9",
    "--figure-dot": "#e6e6e6",
    "--figure-red": "#ff6b6b",
    "--figure-green": "#6be0a0",
    "--figure-blue": "#6b9bff",
    "--figure-weight": "0.6px",
    "--figure-ease": "cubic-bezier(0.32, 0.72, 0, 1)",
    "--figure-mono": "ui-monospace, monospace",
  },
};
const attribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Keep web's allow-scripts sandbox: ReactNativeWebView is exposed only to the host,
 * never to the untrusted figure. Step/Run/Reset remain the figure's own controls. */
export function widgetHost(html: string, reducedMotion: boolean): string {
  const payload = {
    ...theme,
    tokens: {
      ...theme.tokens,
      ...(reducedMotion
        ? { "--duration-fast": "0ms", "--duration-normal": "0ms", "--duration-slow": "0ms" }
        : {}),
    },
  };
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#0e0e0e;color:#ededed}iframe{border:0;width:100%;display:block;height:447px}</style></head><body><iframe id="figure" title="Interactive figure" sandbox="allow-scripts" srcdoc="${attribute(html)}"></iframe><script>
const frame=document.getElementById('figure');const theme=${JSON.stringify(payload)};
const post=()=>frame.contentWindow.postMessage(theme,'*');
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const d=event.data;if(!d||typeof d!=='object')return;
if(d.type==='avenire:widget:ready'){post();window.ReactNativeWebView.postMessage(JSON.stringify(d));}
else if(d.type==='avenire:widget:height'&&Number.isFinite(d.height)&&d.height>=0&&d.height<=20000){frame.style.height=Math.max(40,d.height)+'px';window.ReactNativeWebView.postMessage(JSON.stringify(d));}
else if(d.type==='avenire:widget:error'&&typeof d.message==='string'&&d.message.length<=2000)window.ReactNativeWebView.postMessage(JSON.stringify(d));});
frame.addEventListener('load',post);true;</script></body></html>`;
}

export function WidgetOutput({ asset, onAsk }: { asset: Asset; onAsk: (text: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const document = useQuery(
    () =>
      Effect.tryPromise({
        try: async (signal) => {
          const url = new URL(asset.url, apiUrl);
          const headers = url.origin === new URL(apiUrl).origin ? await getCookieHeader() : {};
          const response = await fetch(url.toString(), { signal, headers, credentials: "omit" });
          if (!response.ok) throw new Error("This figure couldn't be downloaded.");
          return response.text();
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("This figure couldn't load."),
      }),
    `mobile-widget-${asset.id}-${attempt}`,
  );
  if (document.loading)
    return (
      <>
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  if (document.error || !document.data)
    return (
      <View style={{ padding: 20 }}>
        <ErrorState
          message={errorMessage(document.error)}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </View>
    );
  return (
    <WidgetFrame
      key={`${asset.id}:${attempt}`}
      html={document.data}
      title={asset.title}
      onRetry={() => setAttempt((value) => value + 1)}
      onAsk={onAsk}
    />
  );
}

function WidgetFrame({
  html,
  title,
  onRetry,
  onAsk,
}: {
  html: string;
  title: string;
  onRetry: () => void;
  onAsk: (text: string) => void;
}) {
  const reduced = useReducedMotion();
  const source = useMemo(
    () => ({ html: widgetHost(html, reduced), baseUrl: apiUrl }),
    [html, reduced],
  );
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setError("This figure couldn't load."), 30000);
    return () => clearTimeout(timer.current);
  }, []);
  return (
    <View
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, backgroundColor: "#0E0E0E", gap: 12 }}
    >
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : (
        <View style={{ flex: 1, minHeight: 280 }}>
          <WebView
            source={source}
            accessibilityLabel={`Interactive figure: ${title}`}
            style={{ flex: 1, backgroundColor: "#0E0E0E", opacity: ready ? 1 : 0 }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled={false}
            sharedCookiesEnabled={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) =>
              request.url === "about:blank" ||
              request.url === "about:srcdoc" ||
              request.url === apiUrl ||
              request.url === `${apiUrl}/`
            }
            onMessage={(event) => {
              try {
                const data: unknown = JSON.parse(event.nativeEvent.data);
                if (!data || typeof data !== "object") return;
                const message = data as Record<string, unknown>;
                if (message.type === "avenire:widget:ready") {
                  clearTimeout(timer.current);
                  setReady(true);
                } else if (
                  message.type === "avenire:widget:error" &&
                  typeof message.message === "string" &&
                  message.message.length <= 2000
                ) {
                  clearTimeout(timer.current);
                  setError(message.message || "This figure couldn't load.");
                }
              } catch {
                /* Ignore messages outside the widget protocol. */
              }
            }}
            onError={() => {
              clearTimeout(timer.current);
              setError("This figure couldn't load.");
            }}
            onHttpError={() => {
              clearTimeout(timer.current);
              setError("This figure couldn't load.");
            }}
          />
          {!ready ? (
            <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : null}
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          paddingHorizontal: 4,
          paddingBottom: 20,
        }}
      >
        <Text variant="meta" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
          Built by Ava overnight · runs on your phone
        </Text>
        <Button
          variant="link"
          accessibilityLabel={`Ask Ava about a part of ${title}`}
          hitSlop={6}
          onPress={() => onAsk(`Explain the parts of the ${title} figure.`)}
        >
          Ask about a part
        </Button>
      </View>
    </View>
  );
}
