import { widgetTokens } from "./data";
import { apiUrl } from "../../../state/auth";

export const themeMessage = { type: "avenire:theme", colorScheme: "dark", tokens: widgetTokens } as const;
export type WidgetMessage = { type: "avenire:widget:ready" } | { type: "avenire:widget:height"; height: number } | { type: "avenire:widget:error"; message: string };

/** Mirrors packages/ui's protocol bounds. No widget data becomes executable native code. */
export function decodeWidgetMessage(value: unknown): WidgetMessage | undefined {
  if (!value || typeof value !== "object") return;
  if (!("type" in value)) return;
  if (value.type === "avenire:widget:ready") return { type: value.type };
  if (value.type === "avenire:widget:height" && "height" in value && typeof value.height === "number" && Number.isFinite(value.height) && value.height >= 0 && value.height <= 20_000) return { type: value.type, height: value.height };
  if (value.type === "avenire:widget:error" && "message" in value && typeof value.message === "string" && value.message.length <= 2000) return { type: value.type, message: value.message };
}

export function assetUrl(url: string): string {
  const parsed = new URL(url, apiUrl);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error("This media URL is not supported.");
  return parsed.href;
}

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** An opaque-origin allow-scripts iframe retains web WidgetFrame's isolation inside WKWebView. */
export function widgetHostDocument(url: string, title: string, reducedMotion: boolean): string {
  const theme = JSON.stringify(themeMessage).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#0e0e0e;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0;color-scheme:normal}</style></head><body><script>
  const theme=${theme};
  window.addEventListener('message',function(event){
    const frame=document.getElementById('widget');
    if(!frame||event.source!==frame.contentWindow)return;
    const data=event.data;
    if(!data||!['avenire:widget:ready','avenire:widget:height','avenire:widget:error'].includes(data.type))return;
    if(data.type==='avenire:widget:ready')frame.contentWindow.postMessage(theme,'*');
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  });
  </script><iframe id="widget" src="${escapeHtml(assetUrl(url))}" title="${escapeHtml(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" allow="" loading="eager"></iframe><script>
  document.getElementById('widget').addEventListener('load',function(){this.contentWindow.postMessage(theme,'*');});
  document.documentElement.dataset.reducedMotion='${reducedMotion}';
  </script></body></html>`;
}
