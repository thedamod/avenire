import { adaptFigureTheme } from "./figure-theme.ts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const WidgetReadySchema = Schema.Struct({ type: Schema.Literal("avenire:widget:ready") });
export const WidgetHeightSchema = Schema.Struct({
  type: Schema.Literal("avenire:widget:height"),
  height: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 20_000 })),
});
export const WidgetErrorSchema = Schema.Struct({
  type: Schema.Literal("avenire:widget:error"),
  message: Schema.String.check(Schema.isMaxLength(2000)),
});
export const WidgetMessageSchema = Schema.Union([
  WidgetReadySchema,
  WidgetHeightSchema,
  WidgetErrorSchema,
]);
export type WidgetMessage = typeof WidgetMessageSchema.Type;
export const ThemeMessageSchema = Schema.Struct({
  type: Schema.Literal("avenire:theme"),
  colorScheme: Schema.Literals(["light", "dark"]),
  tokens: Schema.Record(Schema.String, Schema.String),
});
export type ThemeMessage = typeof ThemeMessageSchema.Type;
const decode = Schema.decodeUnknownOption(WidgetMessageSchema);

export function decodeWidgetMessage(data: unknown): Option.Option<WidgetMessage> {
  try {
    return decode(data);
  } catch {
    // Even hostile objects with throwing getters must never escape the wire decoder.
    return Option.none();
  }
}

export const WIDGET_IFRAME_SANDBOX = "allow-scripts";

function safeOrigin(origin: string): string {
  const parsed = new URL(origin);
  if (
    !/^https?:$/.test(parsed.protocol) ||
    parsed.origin !== origin ||
    !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(parsed.hostname)
  ) {
    throw new Error("CSP sources must be HTTP(S) origins without paths or credentials");
  }
  return parsed.origin;
}

function kitsSource(origin?: string): string {
  return origin ? ` ${safeOrigin(origin)}/kits/` : "";
}

function contentPolicy(kitsOrigin?: string): string {
  return `default-src 'none'; script-src 'unsafe-inline'${kitsSource(kitsOrigin)}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
}

export function WIDGET_RESPONSE_CSP(options: {
  kitsOrigin?: string;
  frameAncestors: ReadonlyArray<string>;
}): string {
  const ancestors = options.frameAncestors.map(safeOrigin);
  return `sandbox allow-scripts; ${contentPolicy(options.kitsOrigin)}; frame-ancestors ${ancestors.join(" ") || "'none'"}`;
}

/** Preserve Figure's corners while allowing long live values to wrap inside the card. */
const BASE_CSS = `body{font-family:var(--font-sans);font-size:var(--text-base);line-height:var(--leading-normal);color:var(--foreground);background:transparent;margin:0}code,pre,kbd,samp{font-family:var(--font-mono)}
.iso .iso-plate-corners{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto 1fr auto;column-gap:16px}
.iso .iso-plate-corners .iso-plate-corner{position:static;min-width:0;white-space:normal;overflow-wrap:anywhere;line-height:1.4}
.iso .iso-plate-corners [data-corner="fig"]{grid-column:1;grid-row:1}
.iso .iso-plate-corners [data-corner="title"]{grid-column:2;grid-row:1;text-align:right}
.iso .iso-plate-corners [data-corner="hint"]{grid-column:1;grid-row:3;align-self:end}
.iso .iso-plate-corners [data-corner="readout"]{grid-column:2;grid-row:3;align-self:end;text-align:right}
@media(max-width:560px){.iso .iso-plate-corners{grid-template-rows:auto 1fr auto auto;row-gap:6px}.iso .iso-plate-corners [data-corner="hint"]{grid-column:1 / -1;grid-row:3}.iso .iso-plate-corners [data-corner="readout"]{grid-column:1 / -1;grid-row:4}}
`;

const validToken = (name: string, value: unknown): value is string =>
  /^--[a-z0-9-]+$/.test(name) && typeof value === "string" && !/[<>{};]/.test(value);
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// No user input is interpolated into this script. Updates use the same token allowlist as first paint.
const BOOTSTRAP = `(()=>{
const syncIso=()=>{
 const scheme=document.documentElement.dataset.theme;
 const root=getComputedStyle(document.documentElement);
 document.querySelectorAll(".iso").forEach(el=>{
  el.dataset.theme=scheme;
  for(let i=0;i<root.length;i++){
   const name=root[i];
   if(name.startsWith("--figure-"))el.style.setProperty(name,root.getPropertyValue(name));
  }
 });
};
// Sync parsed .iso wrappers before deferred module scripts read their initial theme.
const initialObserver=new MutationObserver(syncIso);
initialObserver.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("DOMContentLoaded",()=>{syncIso();initialObserver.disconnect();});
const style=document.getElementById("avenire-theme");
const base=${JSON.stringify(BASE_CSS)};
const send=msg=>parent.postMessage(msg,"*");
window.addEventListener("message",event=>{
 if(event.source!==window.parent)return;
 const d=event.data;
 if(!d||d.type!=="avenire:theme"||(d.colorScheme!=="light"&&d.colorScheme!=="dark")||!d.tokens||typeof d.tokens!=="object"||Array.isArray(d.tokens))return;
 const entries=Object.entries(d.tokens);
 if(entries.some(([,v])=>typeof v!=="string"))return;
 const tokens=entries.filter(([k,v])=>/^--[a-z0-9-]+$/.test(k)&&!/[<>{};]/.test(v));
 style.textContent=":root{color-scheme:"+d.colorScheme+";"+tokens.map(([k,v])=>k+":"+v+";").join("")+"}"+base;
 document.documentElement.dataset.theme=d.colorScheme;
 syncIso();
 window.dispatchEvent(new CustomEvent("avenire:themechange",{detail:{...d,tokens:Object.fromEntries(tokens)}}));
});
let lastHeight,scheduled=false;
const measure=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{
 scheduled=false;const body=document.body;if(!body)return;
 // The body, not the root: the root is never shorter than the frame, so a widget could never shrink.
 const css=getComputedStyle(body);
 const height=Math.min(20000,Math.max(0,Math.ceil(body.getBoundingClientRect().height+parseFloat(css.marginTop)+parseFloat(css.marginBottom))));
 if(height!==lastHeight){lastHeight=height;send({type:"avenire:widget:height",height});}
});};
if(window.ResizeObserver){const observer=new ResizeObserver(measure);observer.observe(document.documentElement);document.addEventListener("DOMContentLoaded",()=>{if(document.body)observer.observe(document.body);measure();});}
window.addEventListener("load",()=>{send({type:"avenire:widget:ready"});measure();});
const report=message=>send({type:"avenire:widget:error",message:String(message).slice(0,2000)});
window.addEventListener("error",event=>report(event.message||"Widget runtime error"));
window.addEventListener("unhandledrejection",event=>report(event.reason instanceof Error?event.reason.message:event.reason||"Unhandled widget rejection"));
})();`;

/** Mask inert/raw-text markup while preserving offsets for head insertion. */
function markupOnly(html: string): string {
  const scan = html.replace(
    /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes|noscript)\b[\s\S]*?(?:<\/\1\s*>|$)|<plaintext\b[\s\S]*$/gi,
    (match) => " ".repeat(match.length),
  );
  let depth = 0;
  let start = 0;
  let at = 0;
  let result = "";
  for (const match of scan.matchAll(/<(\/?)template(?:\s[^>]*)?\/?>/gi)) {
    if (!match[1]) {
      if (depth++ === 0) start = match.index;
    } else if (depth > 0 && --depth === 0) {
      const end = match.index + match[0].length;
      result += scan.slice(at, start) + " ".repeat(end - start);
      at = end;
    }
  }
  if (depth > 0) return result + scan.slice(at, start) + " ".repeat(scan.length - start);
  return result + scan.slice(at);
}

export interface WidgetDocumentOptions {
  html: string;
  title: string;
  colorScheme: "light" | "dark";
  tokens: Readonly<Record<string, string>>;
  kitsOrigin?: string;
}

export function buildWidgetDocument({
  html,
  title,
  colorScheme,
  tokens,
  kitsOrigin,
}: WidgetDocumentOptions): string {
  html = adaptFigureTheme(html);
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const declarations = Object.entries(tokens)
    .filter(([name, value]) => validToken(name, value))
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentPolicy(kitsOrigin))}"><style id="avenire-theme">:root{color-scheme:${scheme};${declarations}}${BASE_CSS}</style><script>${BOOTSTRAP}</script>`;
  const scan = markupOnly(html);
  const htmlOpen = /<html(?:\s[^>]*)?>/i.exec(scan);
  if (!htmlOpen && !/^\s*<!doctype\b/i.test(scan)) {
    return `<!doctype html><html data-theme="${scheme}"><head>${head}</head><body>${html}</body></html>`;
  }
  let document = html;
  if (htmlOpen) {
    const tag = htmlOpen[0]
      .replace(/\sdata-theme\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/>$/, ` data-theme="${scheme}">`);
    document =
      html.slice(0, htmlOpen.index) + tag + html.slice(htmlOpen.index + htmlOpen[0].length);
  } else {
    const doctype = /^\s*<!doctype[^>]*>/i.exec(scan)!;
    document =
      html.slice(0, doctype[0].length) +
      `<html data-theme="${scheme}">` +
      html.slice(doctype[0].length) +
      "</html>";
  }
  const documentScan = markupOnly(document);
  const headOpen = /<head(?:\s[^>]*)?>/i.exec(documentScan);
  const rootOpen = /<html(?:\s[^>]*)?>/i.exec(documentScan)!;
  const at = headOpen ? headOpen.index + headOpen[0].length : rootOpen.index + rootOpen[0].length;
  return document.slice(0, at) + (headOpen ? head : `<head>${head}</head>`) + document.slice(at);
}
