/** Where a citation points inside a source: `?page=11`, `?t=1120`, `?region=x,y,w,h`, `?q=`. */
export interface CitationTarget {
  readonly page?: number;
  readonly t?: number;
  /** Normalised 0–1 box on an image. */
  readonly region?: Region;
  readonly q?: string;
}

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function positive(value: string | null): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function parseRegion(value: string | null | undefined): Region | undefined {
  const parts = value?.split(",").map(Number);
  if (!parts || parts.length !== 4 || parts.some((part) => !Number.isFinite(part)))
    return undefined;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const [x, y, w, h] = parts.map(clamp) as [number, number, number, number];
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

export function parseCitation(params: URLSearchParams): CitationTarget {
  const page = positive(params.get("page"));
  const t = positive(params.get("t"));
  const region = parseRegion(params.get("region"));
  const q = params.get("q")?.trim();
  return {
    ...(page ? { page: Math.floor(page) } : {}),
    ...(t !== undefined ? { t } : {}),
    ...(region ? { region } : {}),
    ...(q ? { q } : {}),
  };
}

/** YouTube video id from a watch, youtu.be, shorts or embed URL. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^(www|m)\./, "");
    if (host === "youtu.be") return parsed.pathname.slice(1).split("/")[0] || null;
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
    const match = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
