/** Zoom bounds per viewer: PDF follows PDF.js (10–500%), office text 50–250%, images 100–500%. */
export const ZOOM_RANGE = {
  pdf: { min: 0.1, max: 5, step: 0.1 },
  office: { min: 0.5, max: 2.5, step: 0.1 },
  image: { min: 1, max: 5, step: 0.25 },
} as const;
export type ZoomRange = { readonly min: number; readonly max: number; readonly step: number };

export function clampZoom(value: number, min = 0.5, max = 3) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
/** One button press: snap to the step grid so 0.95 → 1.0 rather than 1.05. */
export function stepZoom(zoom: number, direction: 1 | -1, range: ZoomRange) {
  const steps = Math.round(zoom / range.step + direction * 0.51);
  return clampZoom(Number((steps * range.step).toFixed(2)), range.min, range.max);
}
/** A typed zoom percentage ("125", "125%") or null when it isn't a positive number. */
export function parseZoomInput(raw: string, range: ZoomRange) {
  const value = Number(raw.replace(/%/g, "").trim());
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return null;
  return clampZoom(Number((value / 100).toFixed(2)), range.min, range.max);
}
/** A typed page number clamped to the document, or null when it isn't one. */
export function parsePageInput(raw: string, total: number) {
  const value = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(value) || value < 1 || total < 1) return null;
  return Math.min(total, Math.round(value));
}
export function pageWindow(current: number, total: number, overscan = 2) {
  const center = Math.max(1, Math.min(total, Math.round(current)));
  return { start: Math.max(1, center - overscan), end: Math.min(total, center + overscan) };
}
export function clampPan(value: number, content: number, viewport: number, scale: number) {
  const limit = Math.max(0, (content * scale - viewport) / 2);
  return Math.max(-limit, Math.min(limit, value));
}
/** Canvas pixel ratio that keeps a page under the ~16.7M px iOS canvas limit at high zoom. */
export function safePixelRatio(device: number, width: number, height: number, budget = 16e6) {
  const ratio = Number.isFinite(device) && device > 0 ? device : 1;
  const area = width * height;
  if (!Number.isFinite(area) || area <= 0) return ratio;
  // No floor: a poster page must drop below 0.5 rather than exceed the canvas limit.
  return Math.min(ratio, Math.sqrt(budget / area));
}
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
export function highlightText(text: string, query: string) {
  if (!query.trim()) return escapeHtml(text);
  const pattern = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let from = 0;
  let result = "";
  for (const match of text.matchAll(pattern)) {
    result += escapeHtml(text.slice(from, match.index)) + `<mark>${escapeHtml(match[0])}</mark>`;
    from = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(from));
}

/** Character ranges `[start, end)` per text item that a citation covers on one page. */
export type ItemRanges = Map<number, Array<[number, number]>>;

const ignorable = /[\s­​-‍﻿-]/;

/**
 * Lowercased text with whitespace, soft hyphens and hyphens removed, so a passage still
 * matches when PDF.js splits words across items or lines ("thermo-" + "dynamics").
 */
function compact(text: string) {
  let out = "";
  for (const char of text) if (!ignorable.test(char)) out += char.toLowerCase();
  return out;
}

/** Shorter fallbacks for a long passage: the whole thing, its first 180 chars, first 12/6 words. */
export function citationQueries(query: string) {
  const clean = query.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const candidates = [clean, clean.slice(0, 180)];
  if (words.length > 12) candidates.push(words.slice(0, 12).join(" "));
  if (words.length > 6) candidates.push(words.slice(0, 6).join(" "));
  return [...new Set(candidates.map(compact).filter((value) => value.length >= 2))];
}

/** Every occurrence of an already-compacted needle in a page's text items, as item ranges. */
export function findInItems(items: readonly string[], needle: string): ItemRanges | null {
  if (!needle) return null;
  let text = "";
  const at: Array<[number, number]> = [];
  items.forEach((item, index) => {
    for (let offset = 0; offset < item.length; offset++) {
      const char = item[offset]!;
      if (ignorable.test(char)) continue;
      text += char.toLowerCase();
      at.push([index, offset]);
    }
  });
  const ranges: ItemRanges = new Map();
  let from = text.indexOf(needle);
  while (from >= 0) {
    const end = from + needle.length;
    for (let i = from; i < end; i++) {
      const [item, offset] = at[i]!;
      const list = ranges.get(item) ?? [];
      const last = list[list.length - 1];
      const gap = last ? items[item]!.slice(last[1], offset) : "";
      if (last && [...gap].every((char) => ignorable.test(char))) last[1] = offset + 1;
      else list.push([offset, offset + 1]);
      ranges.set(item, list);
    }
    from = text.indexOf(needle, end);
  }
  return ranges.size ? ranges : null;
}

/** HTML for one PDF.js text item with the cited ranges wrapped in `<mark>`. */
export function markRanges(text: string, ranges: ReadonlyArray<readonly [number, number]> = []) {
  if (!ranges.length) return escapeHtml(text);
  let result = "";
  let from = 0;
  for (const [start, end] of ranges) {
    result +=
      escapeHtml(text.slice(from, start)) + `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    from = end;
  }
  return result + escapeHtml(text.slice(from));
}
