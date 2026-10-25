// Shared tokens + components for the Avenire mobile screens.
// Output is Paper-safe HTML: inline styles only, flex layout, no margins, one style per text node.

export const C = {
  bg: "#0B0B0B", s1: "#111111", s2: "#161616", s3: "#1C1C1C", s4: "#242424", sheet: "#131313",
  text: "#EDEDED", t2: "#A3A3A3", t3: "#6E6E6E", line: "#222222", line2: "#2E2E2E",
  accent: "#ABC4FF", accentText: "#C2D4FF", accentTint: "#151B2B", accentLine: "#2E3B5E", onAccent: "#0B1020",
  red: "#FF6B6B", green: "#6BE0A0", amber: "#F2C46D",
  nb: { thermo: "#2B9BD8", ethics: "#EF4579", options: "#18803A", ochem: "#D9A50D", research: "#B48BF2", stat: "#B48BF2" },
};

export const W = 390, H = 844;
const SANS = "font-family:system-ui, -apple-system, sans-serif;";
const MONO = "font-family:'Geist Mono', ui-monospace, monospace;";

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- text ----------
export function t(text, size = 15, color = C.text, weight = 400, lh = null, extra = "") {
  const line = lh ?? Math.round(size * 1.35);
  return `<div style="${SANS}font-size:${size}px;line-height:${line}px;color:${color};font-weight:${weight};${extra}">${esc(text)}</div>`;
}
export function mono(text, size = 11, color = C.t2, extra = "") {
  return `<div style="${MONO}font-size:${size}px;line-height:${Math.round(size * 1.4)}px;color:${color};${extra}">${esc(text)}</div>`;
}
export const one = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

// ---------- icons (16-grid line icons, same family as desktop) ----------
const P = {
  back: '<path d="M10 3.5 5.5 8l4.5 4.5" />',
  close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />',
  more: '<circle cx="3.5" cy="8" r="0.9" fill="currentColor"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/><circle cx="12.5" cy="8" r="0.9" fill="currentColor"/>',
  plus: '<path d="M8 3v10M3 8h10" />',
  mic: '<rect x="6" y="2.5" width="4" height="7" rx="2" /><path d="M3.8 7.6a4.2 4.2 0 0 0 8.4 0M8 11.8v1.8" />',
  up: '<path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />',
  search: '<circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3.3 3.3" />',
  moon: '<path d="M10.8 2.8a5.2 5.2 0 1 0 2.4 7.6 4.2 4.2 0 0 1-2.4-7.6Z" />',
  cloud: '<path d="M4.6 12.5h6.9a2.9 2.9 0 0 0 .3-5.8A3.9 3.9 0 0 0 4.3 7.4a2.6 2.6 0 0 0 .3 5.1Z" />',
  chat: '<path d="M3 4.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11h.5" />',
  doc: '<path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3M6 8.5h4M6 10.5h4" />',
  note: '<path d="M4 2.5h8v11H4z" /><path d="M6 5.5h4M6 8h4M6 10.5h2.5" />',
  video: '<rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m7 6.3 2.8 1.7L7 9.7z" />',
  globe: '<circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.6 1.6 2.4 3.4 2.4 5.5S9.6 11.9 8 13.5C6.4 11.9 5.6 10.1 5.6 8S6.4 4.1 8 2.5Z" />',
  image: '<rect x="2.5" y="3" width="11" height="10" rx="1.5" /><circle cx="6" cy="6.5" r="1.1" /><path d="m3 11.5 3.2-3 2.3 2 2-1.6 2.5 2.1" />',
  check: '<path d="m3.5 8.3 2.8 2.7 6.2-6.5" />',
  chevR: '<path d="m6 3.5 4.5 4.5L6 12.5" />',
  chevD: '<path d="m4 6 4 4 4-4" />',
  chevU: '<path d="m4 10 4-4 4 4" />',
  filter: '<path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />',
  compose: '<path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="m7 9 .4-2L12 2.4l1.6 1.6L9 8.6z" />',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />',
  restore: '<path d="M3 8a5 5 0 1 0 1.5-3.6" /><path d="M3 2.8v2.6h2.6" />',
  move: '<path d="M2.5 4.5h4l1 1.5h6v7.5h-11Z" /><path d="M7 9.8h4M9.4 8l1.8 1.8-1.8 1.8" />',
  folder: '<path d="M2.5 4.5h4l1 1.5h6v7.5h-11Z" />',
  split: '<rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M8 3v10" />',
  download: '<path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" />',
  panel: '<rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M9.5 3v10" />',
  expand: '<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />',
  clock: '<circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.2l2 1.3" />',
  alert: '<circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5M8 10.8v.2" />',
  warn: '<path d="M8 2.8 14 13H2z" /><path d="M8 6.5v3M8 11.2v.1" />',
  help: '<circle cx="8" cy="8" r="5.5" /><path d="M6.4 6.3a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1M8 11v.1" />',
  pencil: '<path d="m3 13 .6-2.6 7.2-7.2 2 2-7.2 7.2z" />',
  copy: '<rect x="5" y="5" width="8" height="8.5" rx="1.2" /><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6" />',
  save: '<path d="M3.5 2.5h7l2 2v9h-9z" /><path d="M5.5 2.5v3h4v-3M5.5 13.5v-4h5v4" />',
  spinner: '<path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />',
  ring: '<circle cx="8" cy="8" r="5.5" stroke-dasharray="2 2" />',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />',
  bell: '<path d="M4 11.5V7.5a4 4 0 0 1 8 0v4l1 1H3z" /><path d="M6.8 13.8a1.3 1.3 0 0 0 2.4 0" />',
  laptop: '<rect x="3.5" y="3.5" width="9" height="6.5" rx="1" /><path d="M1.8 12.5h12.4" />',
  quiz: '<circle cx="8" cy="8" r="5.5" /><path d="M6.4 6.3a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1M8 11v.1" />',
  lines: '<path d="M3 4.5h10M3 8h10M3 11.5h6" />',
  widget: '<path d="M8 2.5 13.5 13h-11z" />',
  play: '<path d="M5.5 3.5v9l7-4.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5 3.5v9M11 3.5v9" />',
  gear: '<circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.7M8 12.5v1.7M14.2 8h-1.7M3.5 8H1.8M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2M12.4 12.4l-1.2-1.2M4.8 4.8 3.6 3.6" />',
};
export function ic(name, size = 16, color = C.t2, sw = 1.5) {
  const body = P[name];
  if (!body) throw new Error(`icon ${name}`);
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${color}" color="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${body}</svg>`;
}

// Site favicons (never text badges for file types)
export function fav(kind, size = 16) {
  const r = Math.round(size * 0.22);
  switch (kind) {
    case "youtube": return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="${size}" height="${Math.round(size * 0.72)}" viewBox="0 0 16 11.5"><rect width="16" height="11.5" rx="3" fill="#FF3B30"/><path d="M6.4 3.3v4.9l4.2-2.45z" fill="#fff"/></svg></div>`;
    case "wiki": return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="font-family:Georgia, serif;font-size:${Math.round(size * 0.72)}px;line-height:${size}px;color:#111;">W</div></div>`;
    case "arxiv": return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:#B31B1B;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="font-family:Georgia, serif;font-size:${Math.round(size * 0.7)}px;line-height:${size}px;color:#fff;">χ</div></div>`;
    case "libre": return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:#2F6FD6;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="${SANS}font-size:${Math.round(size * 0.45)}px;line-height:${size}px;font-weight:700;color:#fff;">LT</div></div>`;
    case "canvas": return `<div style="width:${size}px;height:${size}px;border-radius:${size}px;background:#E13F2B;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="width:${Math.round(size * 0.36)}px;height:${Math.round(size * 0.36)}px;border-radius:9px;background:#fff;"></div></div>`;
    case "physics": return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:#3A2A8C;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("lines", Math.round(size * 0.7), "#C8C2FF", 1.6)}</div>`;
    case "nature": return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><div style="font-family:Georgia, serif;font-size:${Math.round(size * 0.7)}px;line-height:${size}px;font-weight:700;color:#111;">n</div></div>`;
    default: return `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic(kind, size, C.t2, 1.4)}</div>`;
  }
}

// Notebook swatch (tiny book shape, as desktop)
export const swatch = (color, w = 7, h = 9) =>
  `<div style="width:${w}px;height:${h}px;background:${color};border-radius:1px 2px 2px 1px;flex-shrink:0;"></div>`;

export function nbTag(name, color, size = 13, textColor = C.t2) {
  return `<div style="display:flex;align-items:center;gap:6px;min-width:0;">${swatch(color)}${t(name, size, textColor, 400, null, one)}</div>`;
}

// ---------- chrome ----------
export function statusBar(color = "white") {
  return `<div layer-name="Status bar" style="display:flex;align-items:center;gap:154px;padding:21px 24px 19px;flex-shrink:0;">
  <div layer-name="Time" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;">
    <div style="color:${color};font-family:system-ui;font-size:17px;font-weight:600;text-align:center;width:fit-content">9:41</div>
  </div>
  <div layer-name="Icons" style="display:flex;flex-direction:column;flex:1;align-items:center;justify-content:center;">
    <svg width="82" height="22" viewBox="0 0 82 22" style="flex-shrink:0" fill="${color}">
      <path d="M3.7 13H2.5a1 1 0 0 0-1 1v2.5a1 1 0 0 0 1 1h1.2a1 1 0 0 0 1-1V14a1 1 0 0 0-1-1m5.2-2.5H7.7a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1.2a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1M14.1 8h-1.2a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h1.2a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1m5.2-2.5h-1.2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1.2a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1" />
      <path fill-rule="evenodd" d="M36.57 7.8c2.49 0 4.88.92 6.68 2.58.14.13.36.12.49 0l1.3-1.27a.34.34 0 0 0 0-.5 12.55 12.55 0 0 0-16.93 0 .34.34 0 0 0 0 .5l1.3 1.26c.13.13.34.14.48 0a10 10 0 0 1 6.68-2.57m0 4.22a5.4 5.4 0 0 1 3.67 1.44c.14.13.35.13.48 0l1.3-1.33a.37.37 0 0 0-.01-.52 7.9 7.9 0 0 0-10.88 0 .37.37 0 0 0 0 .52l1.29 1.32c.13.14.34.14.48 0 1-.92 2.31-1.43 3.67-1.43m2.52 2.8q0 .15-.1.28l-2.18 2.45a.3.3 0 0 1-.24.11.3.3 0 0 1-.24-.1l-2.18-2.46a.43.43 0 0 1 .01-.56 3.44 3.44 0 0 1 4.82 0 .4.4 0 0 1 .11.28" clip-rule="evenodd" />
      <path fill-rule="evenodd" d="M70.5 5c2.05 0 3.08 0 3.88.34a4.3 4.3 0 0 1 2.28 2.28c.34.8.34 1.83.34 3.88s0 3.08-.34 3.88a4.3 4.3 0 0 1-2.28 2.28c-.8.34-1.83.34-3.88.34h-12c-2.05 0-3.08 0-3.88-.34a4.3 4.3 0 0 1-2.28-2.28c-.34-.8-.34-1.83-.34-3.88s0-3.08.34-3.88a4.3 4.3 0 0 1 2.28-2.28C55.42 5 56.45 5 58.5 5zM58.28 6c-1.85 0-2.77 0-3.48.36a3.3 3.3 0 0 0-1.44 1.44C53 8.5 53 9.43 53 11.28v.44c0 1.85 0 2.77.36 3.48a3.3 3.3 0 0 0 1.44 1.44c.7.36 1.63.36 3.48.36h12.44c1.85 0 2.77 0 3.48-.36a3.3 3.3 0 0 0 1.44-1.44c.36-.7.36-1.63.36-3.48v-.44c0-1.85 0-2.77-.36-3.48a3.3 3.3 0 0 0-1.44-1.44C73.5 6 72.57 6 70.72 6z" clip-rule="evenodd" style="opacity: .35" />
      <path d="M54 11c0-1.4 0-2.1.27-2.63a2.5 2.5 0 0 1 1.1-1.1C55.9 7 56.6 7 58 7h13c1.4 0 2.1 0 2.64.27q.72.37 1.09 1.1C75 8.9 75 9.6 75 11v1c0 1.4 0 2.1-.27 2.64a2.5 2.5 0 0 1-1.1 1.09C73.1 16 72.4 16 71 16H58c-1.4 0-2.1 0-2.63-.27a2.5 2.5 0 0 1-1.1-1.1C54 14.1 54 13.4 54 12z" />
      <path d="M78 9.5v4.08a2.2 2.2 0 0 0 1.33-2.04A2.2 2.2 0 0 0 78 9.5" style="opacity: .35" />
    </svg>
  </div>
</div>`;
}

export const homeIndicator = (color = "#EDEDED") =>
  `<div layer-name="Home indicator" style="position:absolute;left:128px;bottom:8px;width:134px;height:5px;border-radius:3px;background:${color};"></div>`;

// t3code glass header button (Liquid Glass circle)
export function glass(icon, { size = 40, color = C.text, label = null, accent = false } = {}) {
  const bg = accent ? C.accentTint : "rgba(30,30,30,0.72)";
  const border = accent ? C.accentLine : "rgba(255,255,255,0.08)";
  if (label) {
    return `<div style="height:${size}px;padding:0 14px;border-radius:${size / 2}px;background:${bg};backdrop-filter:blur(16px);border:1px solid ${border};display:flex;align-items:center;gap:6px;flex-shrink:0;">${icon ? ic(icon, 15, color) : ""}${t(label, 14, color, 500, 18)}</div>`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${bg};backdrop-filter:blur(16px);border:1px solid ${border};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic(icon, 17, color, 1.6)}</div>`;
}

// Navigation bar for pushed screens: back · centred title/subtitle · trailing glass buttons
export function navBar({ title = "", sub = "", left = "back", right = ["more"], subColor = C.t3 } = {}) {
  const slot = (items) => {
    const html = items.map((it) => (typeof it === "string" ? glass(it) : glass(it.icon ?? null, it))).join("");
    return html;
  };
  const leftItems = left === "back" ? ["back"] : left === "close" ? ["close"] : left ? [left] : [];
  const width = (items) => items.reduce((w, it) => w + (typeof it === "object" && it.label ? 104 : 40), 0) + Math.max(0, items.length - 1) * 8;
  const lw = Math.max(width(leftItems), width(right), 40);
  return `<div layer-name="Nav bar" style="display:flex;align-items:center;height:52px;padding:0 16px;flex-shrink:0;gap:8px;">
  <div style="width:${lw}px;display:flex;align-items:center;gap:8px;flex-shrink:0;">${slot(leftItems)}</div>
  <div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;">${title ? t(title, 16, C.text, 600, 20, one + "max-width:100%;text-align:center;") : ""}${sub ? t(sub, 12, subColor, 400, 15, one + "text-align:center;") : ""}</div>
  <div style="width:${lw}px;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0;">${slot(right)}</div>
</div>`;
}

// ---------- composer (t3code mobile: capsule at rest, card when focused) ----------
export function capsule({ placeholder = "Ask Ruth, @ a source or note", send = true, mic = true, plus = true } = {}) {
  return `<div layer-name="Composer capsule" style="height:52px;border-radius:26px;background:rgba(20,20,20,0.88);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.07);box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);display:flex;align-items:center;padding:0 9px 0 4px;gap:2px;flex-shrink:0;">
  ${plus ? `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("plus", 18, C.t2, 1.6)}</div>` : `<div style="width:12px;flex-shrink:0;"></div>`}
  ${t(placeholder, 15, C.t3, 400, 20, "flex:1;min-width:0;" + one)}
  ${mic ? `<div style="width:38px;height:44px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("mic", 18, C.t2, 1.5)}</div>` : ""}
  ${send ? `<div style="width:34px;height:34px;border-radius:17px;background:${C.accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("up", 16, C.onAccent, 1.8)}</div>` : ""}
</div>`;
}

// Context strip under the capsule (note page only, as desktop)
export function contextStrip(items = [["moon", "Ruth"], ["sw:" + C.nb.thermo, "This note"], ["clock", "Now"]]) {
  const cells = items.map(([i, label]) => {
    const lead = i.startsWith("sw:") ? swatch(i.slice(3)) : ic(i, 13, C.t2, 1.4);
    return `<div style="display:flex;align-items:center;gap:5px;height:28px;padding:0 8px;">${lead}${t(label, 12, C.t2, 400, 16)}${ic("chevD", 10, C.t3, 1.4)}</div>`;
  }).join(`<div style="width:1px;height:12px;background:${C.line2};flex-shrink:0;"></div>`);
  return `<div style="padding:0 22px;display:flex;flex-shrink:0;"><div layer-name="Context strip" style="flex:1;display:flex;align-items:center;padding:0 6px;border:1px solid ${C.line};border-top:none;border-radius:0 0 14px 14px;background:rgba(17,17,17,0.9);">${cells}</div></div>`;
}

// Bottom composer region with gradient fade; banner (optional) attaches above the capsule
export function composerDock({ placeholder, banner = "", strip = "", above = "", send = true } = {}) {
  return `<div layer-name="Composer dock" style="position:absolute;left:0;right:0;bottom:0;padding:28px 12px 30px;display:flex;flex-direction:column;background:linear-gradient(180deg, rgba(11,11,11,0) 0%, rgba(11,11,11,0.94) 30%, #0B0B0B 100%);">
  ${above}${banner}${capsule({ placeholder, send })}${strip}
</div>${homeIndicator()}`;
}

// Composer tray: the ONE drop-up above the composer for file changes, approvals, questions and errors.
// Same shell every time (t3code ComposerBanner "attached"); tone only colours the header icon.
export const trayBtn = (label, kind = "secondary") => {
  const k = { primary: `background:#EDEDED;`, secondary: `background:${C.s3};border:1px solid ${C.line2};`, ghost: "" }[kind];
  const fg = { primary: "#0A0A0A", secondary: C.text, ghost: C.t2 }[kind];
  return `<div style="height:32px;padding:0 ${kind === "ghost" ? 4 : 12}px;border-radius:8px;${k}display:flex;align-items:center;justify-content:center;flex-shrink:0;">${t(label, 13, fg, 500, 16, "white-space:nowrap;")}</div>`;
};
export const trayRow = ({ lead = "", label, detail = "", trail = "" }) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid ${C.line};width:304px;">${lead ? `<div style="width:16px;display:flex;justify-content:center;flex-shrink:0;">${lead}</div>` : ""}<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">${t(label, 13.5, C.text, 500, 18, one)}${detail ? t(detail, 12, C.t3, 400, 16, one) : ""}</div>${trail}</div>`;
export function tray({ tone = "ruth", icon = "moon", title, meta = "", step = "", chevron = "chevD", inline = "", rows = "", body = "", start = "", actions = "" }) {
  const iconColor = tone === "danger" ? C.red : C.accent;
  const head = `<div style="display:flex;align-items:${inline ? "center" : "flex-start"};gap:10px;width:304px;"><div style="width:16px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic(icon, 15, iconColor, 1.5)}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;">${t(title, 14, C.text, 600, 18)}${meta ? t(meta, 12, C.t3, 400, 16, one) : ""}</div>${step ? mono(step, 11, C.t3, "flex-shrink:0;padding-top:2px;") : ""}${inline}${chevron ? `<div style="width:20px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic(chevron, 14, C.t2, 1.5)}</div>` : ""}</div>`;
  const foot = actions ? `<div style="display:flex;align-items:center;gap:6px;width:304px;padding-top:2px;">${start}<div style="flex:1;"></div>${actions}</div>` : "";
  return `<div style="padding:0 16px;display:flex;flex-shrink:0;width:366px;"><div layer-name="Composer tray" style="width:334px;display:flex;flex-direction:column;gap:10px;padding:12px 14px 12px;background:#141414;border:1px solid #2A2A2A;border-bottom:none;border-radius:16px 16px 0 0;">${head}${body}${rows ? `<div style="display:flex;flex-direction:column;width:304px;">${rows}</div>` : ""}${foot}</div></div>`;
}

// ---------- buttons ----------
export function btn(label, kind = "primary", { h = 44, grow = false, icon = null, size = 15 } = {}) {
  const styles = {
    primary: `background:#EDEDED;color:#0A0A0A;`,
    accent: `background:${C.accent};color:${C.onAccent};`,
    secondary: `background:${C.s3};border:1px solid ${C.line2};color:${C.text};`,
    ghost: `color:${C.t2};`,
    danger: `background:#2A1416;border:1px solid #4A2226;color:${C.red};`,
    white: `background:#FFFFFF;color:#0A0A0A;`,
  }[kind];
  const color = { primary: "#0A0A0A", accent: C.onAccent, secondary: C.text, ghost: C.t2, danger: C.red, white: "#0A0A0A" }[kind];
  return `<div style="height:${h}px;padding:0 ${h > 36 ? 16 : 12}px;border-radius:${h > 36 ? 10 : 8}px;${styles}display:flex;align-items:center;justify-content:center;gap:6px;${grow ? "flex:1;" : "flex-shrink:0;"}">${icon ? ic(icon, 15, color, 1.6) : ""}${t(label, size, color, 500, 18, "white-space:nowrap;")}</div>`;
}

export function chip(label, { active = false, lead = "", count = null, h = 32 } = {}) {
  const bg = active ? C.s4 : "transparent";
  const border = active ? C.line2 : C.line2;
  return `<div style="height:${h}px;padding:0 12px;border-radius:${h / 2}px;border:1px solid ${border};background:${bg};display:flex;align-items:center;gap:6px;flex-shrink:0;">${lead}${label ? t(label, 13, active ? C.text : C.t2, active ? 500 : 400, 16, "white-space:nowrap;") : ""}${count !== null ? t(String(count), 12, C.t3, 400, 16) : ""}</div>`;
}

export function toggle(on = true) {
  return `<div style="width:51px;height:31px;border-radius:16px;background:${on ? C.green : "#39393D"};display:flex;align-items:center;padding:2px;justify-content:${on ? "flex-end" : "flex-start"};flex-shrink:0;"><div style="width:27px;height:27px;border-radius:14px;background:#FFFFFF;"></div></div>`;
}

export function checkbox(on) {
  return on
    ? `<div style="width:22px;height:22px;border-radius:11px;background:${C.accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic("check", 13, C.onAccent, 2)}</div>`
    : `<div style="width:22px;height:22px;border-radius:11px;border:1.5px solid ${C.line2};flex-shrink:0;"></div>`;
}

// ---------- tabs ----------
export function underlineTabs(items, active) {
  return `<div layer-name="Tabs" style="display:flex;align-items:flex-end;gap:22px;padding:0 20px;border-bottom:1px solid ${C.line};flex-shrink:0;">${items
    .map(([label, count], i) =>
      i === active
        ? `<div style="display:flex;gap:6px;padding-bottom:10px;border-bottom:1.5px solid ${C.text};">${t(label, 15, C.text, 600, 20)}${count !== undefined ? t(String(count), 13, C.t3, 400, 20) : ""}</div>`
        : `<div style="display:flex;gap:6px;padding-bottom:11.5px;">${t(label, 15, C.t2, 400, 20)}${count !== undefined ? t(String(count), 13, C.t3, 400, 20) : ""}</div>`)
    .join("")}</div>`;
}

// Segmented pills used in sheets (desktop tab strip → horizontal scroll)
export function sheetTabs(items, active, { trailing = "expand" } = {}) {
  return `<div layer-name="Sheet tabs" style="display:flex;align-items:center;gap:4px;padding:0 12px 0 16px;flex-shrink:0;height:44px;">
  <div style="flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden;">${items
    .map(([icon, label], i) => {
      const on = i === active;
      const lead = icon ? (icon.startsWith("fav:") ? fav(icon.slice(4), 14) : ic(icon, 14, on ? C.text : C.t3, 1.4)) : "";
      return `<div style="height:32px;padding:0 11px;border-radius:8px;${on ? `background:${C.s4};` : ""}display:flex;align-items:center;gap:6px;flex-shrink:0;">${lead}${t(label, 14, on ? C.text : C.t2, on ? 600 : 400, 18, "white-space:nowrap;")}</div>`;
    })
    .join("")}</div>
  ${trailing ? `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ic(trailing, 16, C.t2, 1.5)}</div>` : ""}
</div>`;
}

// ---------- sheets ----------
// Dim the page underneath and lay a sheet from `top` to the bottom (iOS formSheet detents 0.55 / 0.92)
export function sheet(inner, { top = 64, title = null, close = true, bg = C.sheet, pad = true } = {}) {
  const head = title
    ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 16px 10px 20px;flex-shrink:0;">${t(title, 18, C.text, 600, 24)}${close ? glass("close", { size: 34 }) : ""}</div>`
    : "";
  return `<div layer-name="Dim" style="position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);"></div>
<div layer-name="Sheet" style="position:absolute;left:0;right:0;top:${top}px;bottom:0;background:${bg};border-radius:24px 24px 0 0;border-top:1px solid #2A2A2A;display:flex;flex-direction:column;overflow:hidden;">
  <div style="display:flex;justify-content:center;padding:7px 0 7px;flex-shrink:0;"><div style="width:36px;height:5px;border-radius:3px;background:#3A3A3A;"></div></div>
  ${head}${inner}
</div>`;
}

// ---------- lists ----------
// Flat aside inside sheets and threads: a left rule instead of a nested rounded card.
export const aside = (inner, { color = C.line2, gap = 6 } = {}) => `<div style="display:flex;flex-direction:column;gap:${gap}px;padding:2px 0 2px 12px;border-left:2px solid ${color};flex-shrink:0;">${inner}</div>`;
// Compact 32px r8 action button (morning report outputs, inline actions).
export const actionBtn = (icon, label, { on = false } = {}) => `<div style="height:32px;padding:0 11px;border-radius:8px;border:1px solid ${on ? C.accentLine : C.line2};background:${on ? C.accentTint : "transparent"};display:flex;align-items:center;gap:6px;flex-shrink:0;">${ic(icon, 14, on ? C.accentText : C.t2, 1.4)}${t(label, 13, on ? C.accentText : C.text, 500, 16, "white-space:nowrap;")}</div>`;
export const divider = (inset = 20) => `<div style="height:1px;background:${C.line};flex-shrink:0;${inset ? `width:calc(100% - ${inset}px);align-self:flex-end;` : ""}"></div>`;

export function sectionHead(label, trailing = "", { pad = "22px 20px 8px" } = {}) {
  return `<div style="display:flex;align-items:baseline;justify-content:space-between;padding:${pad};flex-shrink:0;">${t(label, 15, C.text, 600, 20)}${trailing ? t(trailing, 13, C.t3, 400, 18) : ""}</div>`;
}

export function groupLabel(label, { pad = "20px 20px 6px" } = {}) {
  return `<div style="padding:${pad};flex-shrink:0;">${t(label, 13, C.t3, 400, 18)}</div>`;
}

// t3code mobile thread row: meta line · 2-line title · optional status line; dividers inset 20
export function threadRow({ lead = "", meta = "", metaColor = C.t2, right = "", rightColor = C.t3, title, titleLead = "", sub = "", subColor = C.t3, bg = "" }) {
  return `<div style="display:flex;flex-direction:column;gap:3px;padding:11px 20px 12px;flex-shrink:0;${bg}">
  <div style="display:flex;align-items:center;gap:6px;">${lead}${t(meta, 13, metaColor, 400, 17, "flex:1;min-width:0;" + one)}${t(right, 12, rightColor, rightColor === C.t3 ? 400 : 500, 16, "flex-shrink:0;")}</div>
  <div style="display:flex;align-items:center;gap:7px;">${titleLead}${t(title, 16, C.text, 500, 21, "flex:1;min-width:0;" + one)}</div>
  ${sub ? t(sub, 13, subColor, 400, 17, one) : ""}
</div>`;
}

// ---------- notebook covers (same art as desktop shelf) ----------
const COVER_SVG = {
  thermo: "m16.6 75.7 .3-.7 32.1-16 1.3-.2 52.8 26.3 .3 .6m0 2.5-32.4 16.3-1.3 .2-53.1-26.5m86.8 7.5v2.5m-86.8-12.5v2.5m86.8 7.5-.3 .4-32.1 16-1.3 .2-53.1-26.6m31.4-12.2v-46.6l46.1 23v46.7m-68.2-12.1v-46.6l46.1 23.1v46.6m-24-80.7-22.1 11m68.2 12-22.1 11.1m-12-28.1-9.3 34.5m-12.7-23.5 9.3 25.2m-5.4 4.9 .5-2.7 1.6-2.3 1-.9 1.3-.6 1.3-.5 1.4-.1 1.4 .1 1.3 .5 2.3 1.5 1.5 2.3 .6 2.7-.6 2.7-1.5 2.3-2.3 1.5-2.7 .6-2.7-.6-1.3-.6-1-.9-1.6-2.3zm29.1-35.6-9.3 34.5m-12.7-23.5 9.3 25.2m-5.4 4.9 .6-2.7 1.5-2.3 2.3-1.5 2.7-.6 2.7 .6 2.3 1.5 1.5 2.3 .6 2.7-.6 2.7-1.5 2.3-2.3 1.5-1.3 .5-1.4 .1-1.4-.1-1.3-.5-2.3-1.5-1.5-2.3zm29.1-35.6-9.3 34.5m-12.7-23.5 9.3 25.2m-5.4 4.9 .6-2.7 1.5-2.3 2.3-1.5 2.7-.6 2.7 .6 1.3 .6 1 .9 1.6 2.3 .5 2.7-.5 2.7-1.6 2.3-2.3 1.6-2.7 .5-2.7-.5-2.3-1.6-1.5-2.3z",
  ethics: "m41.6 80.5 .3-1.8 1.1-1.7 1.7-1.6 2.3-1.4 6-2 7-.7 7 .7 6 2 2.3 1.4 1.7 1.6 1.1 1.7 .3 1.8m0 2.5-.3 1.8-1.1 1.7-1.7 1.6-2.3 1.4-2.8 1.2-3.2 .8-7 .7-7-.7-3.2-.8-2.8-1.2-2.3-1.4-1.7-1.6-1.1-1.7-.3-1.8m0-2.5v2.5m36.8-2.5v2.5m0-2.5-.3 1.8-1.1 1.8-1.7 1.6-2.3 1.4-6 2-7 .7-7-.7-6-2-2.3-1.4-1.7-1.6-1.1-1.8-.3-1.8m16.2-9.6 .6-1 1.2-.3 2 .3 .6 1m0 9.8-.2 .4-1.6 .6-1.4-.1-1.2-.9m0-9.8v9.8m4.4-9.8v9.8m0-9.8-.6 .6-1.2 .4-2-.4-.6-.6m-24.7-25.9 .5-5.3 1.5-5 2.5-4.7 3.4-4.1 4-3.3 4.7-2.5 5-1.5 5.3-.6 5.3 .6 5 1.5 4.7 2.5 4 3.3 3.4 4.1 2.5 4.7 1.5 5 .5 5.3-.5 5.2-1.5 5.1-2.5 4.6-3.4 4.1-4 3.3-4.7 2.5-5 1.6-5.3 .5-5.3-.5-5-1.6-4.7-2.5-4-3.3-3.4-4.1-2.5-4.6-1.5-5.1z",
  options: "m17.2 75.1 .1-.3 10.8-5.2 55.7 28m0 1.5-10.6 5.3-.6-.1-55.4-27.7m66.6 21v1.5m-66.6-24v1.5m66.6 21-10.4 5.3h-.8l-55.4-27.8m14.8-3.6-5.1 2.5m9.1-.5-3 1.5m7 .5-5 2.5m9-.5-3 1.5m7 .5-5 2.5m9-.5-3 1.5m7 .5-5 2.5m9-.5-3 1.5m7 .5-5 2.5m9-.5-3 1.5m7 .5-5 2.5m9-.5-3 1.6m7 .5-5 2.5m-30-25.8 20-41.7 3 1.5-20 41.7zm23-40.2 14 58.7-3-1.5-14-58.7zm.6 1.7-.4-1.8-1.1-1.6-1.4-.6h-.6l-.5 .4-.3 .6v1.7l1.4 2.4 .7 .5 1.3 .1 .8-.9zm-3.1-5.4v-6.1l2 1v6.1m-13.5 22 21 10.6m-9.6-4.8-.3-1.2-.7-1-.8-.4-.7 .3-.2 1.4 .9 1.6 1.2 .4z",
  ochem: "m41.5 87.1-2-1.4-4.9-8.4 .6-2.3 1.8-4.2 16-24.1-.1 .3v-16.8m25.6 56.9 2-1.4 4.9-8.4-.6-2.3-1.8-4.2-16-24.1 .1 .3v-16.8m-14.2 0 .7-1.5 1.4-1 4.1-1 2.7 .1 3.2 .9 1.4 1 .7 1.5m11.4 56.9-2.8 1.6-3.4 1.4-3.8 1-7.1 .8-5.7-.2-5.5-.9-3.7-1.1-5-2.6m23.5-54.4-1.8 .7-3.2 .4-3.2-.4-3.1-1.5-.7-1.1v-1.1l.7-1.1 1.3-.9 1.8-.6 2.1-.4h2.2l2.1 .4 1.8 .6 1.3 .9 .7 1.1v1.1l-.3 .5-.4 .6zm11 30.2-.3 1.6-1 1.6-1.6 1.5-2.1 1.3-5.5 1.8-6.5 .7-6.5-.7-5.5-1.8-2.1-1.3-1.6-1.5-1-1.6-.3-1.6",
  research: "m10.9 66.8 46.1-23.1 26 21.6v5l-46 23-26.1-21.6zm0 0 26.1 21.6m46-23.1-46 23.1m0 0v4.9m32-27.6-16-13.4m9 16.9-16-13.4m9 16.9-16-13.3m9 16.8-16-13.3m9 16.8-16.1-13.3m12.1 24.4-26.1-21.6m26.1 19.2 46-23.1 26.1 4.5v4.9l-46.1 23-26-4.4zm0 0 26 4.4m46.1-23-46.1 23m0 0v4.9m16-27 16.1 2.7m-23.1 .8 16 2.7m-23 .8 16 2.7m-23 .8 16 2.7m-23 .8 16 2.7m-30 3.4 26 4.5m33.1-27.7-48.1 24v9.2",
  stat: "m30 40 30-15 30 15v34L60 89 30 74zm0 0 30 15 30-15M60 55v34m-30-49 30 15",
};
export const COVERS = {
  thermo: { name: "Thermodynamics", rgb: "rgb(43, 155, 216)", ink: "#111111", meta: "9 notes|22 sources", spine: "#00000033", stripe: 0.08 },
  ethics: { name: "Ethics Project", rgb: "rgb(239, 69, 121)", ink: "#111111", meta: "4 notes|11 sources", spine: "#00000033", stripe: 0.08 },
  options: { name: "Options Pricing", rgb: "rgb(24, 128, 58)", ink: "#FFFFFF", meta: "14 sources", spine: "#00000033", stripe: 0.07 },
  ochem: { name: "Organic Chemistry", rgb: "rgb(217, 165, 13)", ink: "#1A1206", meta: "9 sources", spine: "#00000029", stripe: 0.09 },
  research: { name: "Research Reading", rgb: "rgb(180, 139, 242)", ink: "#160C26", meta: "5 sources", spine: "#00000029", stripe: 0.09 },
  stat: { name: "Statistical Mechanics", rgb: "rgb(180, 139, 242)", ink: "#160C26", meta: "Empty", spine: "#00000029", stripe: 0.09 },
};
export function cover(key, { w = 120, h = 156, title = true, meta = true, art = 64 } = {}) {
  const c = COVERS[key];
  const metaColor = c.ink === "#FFFFFF" ? "#FFFFFFB3" : "#00000099";
  return `<div layer-name="Cover · ${c.name}" style="width:${w}px;height:${h}px;flex-shrink:0;position:relative;overflow:hidden;border-radius:3px 8px 8px 3px;background:repeating-linear-gradient(135deg, rgba(255,255,255,${c.stripe}) 0px, rgba(255,255,255,${c.stripe}) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 7px) 0% 0% ${c.rgb};">
  <div style="position:absolute;left:0;top:0;width:${Math.max(5, Math.round(w / 16))}px;height:${h}px;background:${c.spine};"></div>
  ${title ? `<div style="position:absolute;left:${Math.round(w * 0.14)}px;top:${Math.round(w * 0.11)}px;width:${w - Math.round(w * 0.14) - 6}px;${SANS}font-size:${w >= 100 ? 12 : 11}px;line-height:${w >= 100 ? 16 : 13}px;font-weight:600;color:${c.ink};">${esc(c.name)}</div>` : ""}
  <div style="position:absolute;right:${Math.round(w * 0.03)}px;bottom:${Math.round(h * 0.12)}px;width:${art}px;height:${art}px;"><svg viewBox="0 0 120 120" width="${art}" height="${art}"><path d="${COVER_SVG[key]}" fill="none" stroke="rgb(0 0 0 / 50%)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  ${meta ? `<div style="position:absolute;left:${Math.round(w * 0.14)}px;bottom:${Math.round(h * 0.06)}px;${MONO}font-size:9.5px;line-height:12px;letter-spacing:0.04em;color:${metaColor};">${c.meta.split("|").map(esc).join("<br/>")}</div>` : ""}
</div>`;
}

// Morning report toast art (t3code "nightly" stage)
export function nightArt(w = 358, h = 64) {
  let stars = "";
  const pts = [[14, 10, .6], [38, 22, .4], [58, 8, .5], [84, 16, .4], [104, 7, .6], [126, 20, .4], [148, 11, .5], [170, 24, .4], [192, 9, .6], [214, 18, .4], [236, 8, .5], [258, 20, .45], [278, 11, .55], [302, 10, .6], [326, 22, .4], [346, 8, .5], [26, 34, .4], [118, 34, .4], [202, 32, .4], [268, 34, .4], [314, 34, .4]];
  for (const [x, y, r] of pts) stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#E4EAFFBF"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;left:0;top:0;">
  <defs><linearGradient id="ngA" x1="24" y1="0" x2="264" y2="96" gradientUnits="userSpaceOnUse" spreadMethod="reflect"><stop stop-color="#07152F"/><stop offset="0.5" stop-color="#151443"/><stop offset="1" stop-color="#32155B"/></linearGradient>
  <radialGradient id="ngB" cx="0" cy="0" r="1" gradientTransform="translate(216 18) rotate(137) scale(120 84)" gradientUnits="userSpaceOnUse"><stop stop-color="#5165D8" stop-opacity="0.4"/><stop offset="0.5" stop-color="#283075" stop-opacity="0.16"/><stop offset="1" stop-color="#07152F" stop-opacity="0"/></radialGradient>
  <linearGradient id="ngC" x1="0" y1="60" x2="288" y2="96" gradientUnits="userSpaceOnUse"><stop stop-color="#4EA4FF" stop-opacity="0.5"/><stop offset="0.52" stop-color="#696FEA" stop-opacity="0.62"/><stop offset="1" stop-color="#A85BEA" stop-opacity="0.5"/></linearGradient>
  <filter id="ngD" x="-24" y="-24" width="${w + 48}" height="${h + 72}" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="4"/></filter></defs>
  <rect width="${w}" height="${h}" fill="url(#ngA)"/><rect width="${w}" height="${h}" fill="url(#ngB)"/>
  <g>${stars}</g>
  <path d="M68.5 28H71.5M70 26.5V29.5M158.5 36H161.5M160 34.5V37.5M244.5 26H247.5M246 24.5V27.5M336.5 28H339.5M338 26.5V29.5" stroke="#C8D7FFB3" stroke-width="0.6" stroke-linecap="round"/>
  <g filter="url(#ngD)" transform="translate(0 -${96 - h + 8})">
    <path d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z" fill="url(#ngC)" fill-opacity="0.85"/>
    <path d="M150 96C151 84 161 75 173 75C176 64 186 57 198 57C210 57 220 64 223 75C231 75 238 80 241 87C250 87 257 91 260 96H150Z" fill="url(#ngC)" fill-opacity="0.7"/>
    <path transform="translate(288 0)" d="M-12 88C-12 74 0 63 14 63C18 50 30 41 44 41C58 41 70 49 74 62C79 57 86 54 94 54C110 54 123 66 124 82C132 83 138 88 141 96H-12V88Z" fill="url(#ngC)" fill-opacity="0.85"/>
  </g>
</svg>`;
}

// iOS dark keyboard (letters are separate text nodes so Paper keeps them editable)
export function keyboard() {
  const key = (l, w = 33) => `<div style="width:${w}px;height:42px;border-radius:5px;background:#5A5A5E;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${l ? t(l, 22, "#FFFFFF", 400, 26) : ""}</div>`;
  const fn = (inner, w) => `<div style="width:${w}px;height:42px;border-radius:5px;background:#3A3A3C;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${inner}</div>`;
  const row = (letters, pad = 3) => `<div style="display:flex;justify-content:center;gap:6px;padding:0 ${pad}px;">${letters.split("").map((l) => key(l)).join("")}</div>`;
  return `<div layer-name="Keyboard" style="position:absolute;left:0;right:0;bottom:0;height:256px;background:#262628;display:flex;flex-direction:column;gap:12px;padding:8px 3px 0;">
  ${row("qwertyuiop")}${row("asdfghjkl", 22)}
  <div style="display:flex;justify-content:space-between;padding:0 3px;">${fn(ic("up", 18, "#fff", 1.6), 42)}<div style="display:flex;gap:6px;">${"zxcvbnm".split("").map((l) => key(l)).join("")}</div>${fn(ic("back", 18, "#fff", 1.6), 42)}</div>
  <div style="display:flex;gap:6px;padding:0 3px;">${fn(t("123", 16, "#fff", 400, 20), 88)}<div style="flex:1;height:42px;border-radius:5px;background:#5A5A5E;display:flex;align-items:center;justify-content:center;">${t("space", 16, "#fff", 400, 20)}</div>${fn(t("Ask Ruth", 16, "#fff", 500, 20), 96)}</div>
  ${homeIndicator("#FFFFFF")}
</div>`;
}

// Floating "Working" pill (t3code floating-working-control)
export function workingPill(label = "Working 6s", { bottom = 100 } = {}) {
  return `<div layer-name="Working pill" style="position:absolute;left:0;right:0;bottom:${bottom}px;display:flex;justify-content:center;gap:12px;">
  <div style="height:38px;padding:0 14px;border-radius:19px;background:rgba(30,30,30,0.8);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;gap:8px;">${ic("spinner", 14, C.accent, 1.8)}${t(label, 13, C.text, 500, 16, "font-variant-numeric:tabular-nums;")}<div style="width:1px;height:14px;background:${C.line2};"></div>${t("Stop", 13, C.t2, 400, 16)}</div>
  <div style="width:38px;height:38px;border-radius:19px;background:rgba(30,30,30,0.8);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;">${ic("chevD", 16, C.text, 1.6)}</div>
</div>`;
}

// Selection dock (icon-only, with count) — sits where the composer was
export function selectionDock(count, icons) {
  return `<div layer-name="Selection dock" style="position:absolute;left:0;right:0;bottom:0;padding:24px 16px 30px;display:flex;justify-content:center;background:linear-gradient(180deg, rgba(11,11,11,0) 0%, #0B0B0B 40%);">
  <div style="height:52px;border-radius:26px;background:rgba(24,24,24,0.9);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;padding:0 8px 0 18px;gap:4px;">
    ${t(`${count} selected`, 14, C.text, 600, 18, "padding-right:8px;white-space:nowrap;")}
    <div style="width:1px;height:20px;background:${C.line2};"></div>
    ${icons.map(([name, color, on]) => `<div style="width:44px;height:44px;border-radius:22px;${on ? `background:${C.s4};` : ""}display:flex;align-items:center;justify-content:center;">${ic(name, 18, color ?? C.text, 1.5)}</div>`).join("")}
  </div>
</div>${homeIndicator()}`;
}

// Inline citation chip (as desktop: file mark + label, cited one in accent)
export function cite(label, kind = "doc", { active = false, tone = null } = {}) {
  const tones = {
    amber: ["#2A1F0E", "#4A3714", "#F2C46D"],
    red: ["#2A1214", "#4A2226", "#FF9B9B"],
  };
  const [bg, border, color] = active ? [C.accentTint, C.accentLine, C.accentText] : tone ? tones[tone] : ["transparent", C.line2, C.text];
  const lead = kind.startsWith("fav:") ? fav(kind.slice(4), 15) : ic(kind, 14, active ? C.accentText : tone ? color : C.t2, 1.4);
  return `<div style="height:30px;padding:0 10px;border-radius:7px;border:1px solid ${border};background:${bg};display:flex;align-items:center;gap:6px;flex-shrink:0;">${lead}${t(label, 13, color, 400, 16, "white-space:nowrap;")}</div>`;
}

// Work-log row (muted, chevron)
export function logRow(icon, text, { color = C.t2, right = "", chevron = true, iconColor = C.t3, rightColor = C.t3 } = {}) {
  return `<div style="display:flex;align-items:center;gap:10px;min-height:30px;">${ic(icon, 14, iconColor, 1.4)}${t(text, 14, color, 400, 19, "flex:1;min-width:0;" + one)}${right ? t(right, 12, rightColor, 400, 16, "flex-shrink:0;") : ""}${chevron ? ic("chevR", 12, C.t3, 1.4) : ""}</div>`;
}

export const userBubble = (text) =>
  `<div style="display:flex;justify-content:flex-end;padding-left:48px;flex-shrink:0;"><div style="padding:10px 14px;border-radius:18px;background:rgba(255,255,255,0.06);">${t(text, 15, C.text, 400, 21)}</div></div>`;

export const ruthText = (text, extra = "") => t(text, 16, C.text, 400, 24, extra);

export function workedHeader(label, right = "") {
  return `<div style="display:flex;align-items:center;gap:6px;padding-bottom:10px;border-bottom:1px solid ${C.line};">${t(label, 14, C.t2, 400, 18)}${ic("chevR", 12, C.t3, 1.5)}<div style="flex:1;"></div>${right ? t(right, 12, C.t3, 400, 16) : ""}</div>`;
}

// Cover line art on its own (cover-drawing picker)
export const coverArt = (key, size = 30, color = "#A3A3A3") =>
  `<svg viewBox="10 10 100 100" width="${size}" height="${size}" style="flex-shrink:0;"><path d="${COVER_SVG[key]}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
