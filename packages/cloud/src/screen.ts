/** Full display coordinates are shared by mouse input, crops and recordings. */
export const SCREEN = { width: 1600, height: 900 } as const;
export type Point = { readonly x: number; readonly y: number };
export type ScreenProfile = {
  readonly id: string;
  readonly image: { readonly width: number; readonly height: number };
  readonly coordinates:
    | { readonly kind: "image-pixels" }
    | { readonly kind: "normalized"; readonly max: number };
};
/** Provisional conventions, deliberately independent of provider/model names. */
export const SCREEN_PROFILES = [
  {
    id: "pixels-1280x720",
    image: { width: 1280, height: 720 },
    coordinates: { kind: "image-pixels" },
  },
  {
    id: "pixels-1024x576",
    image: { width: 1024, height: 576 },
    coordinates: { kind: "image-pixels" },
  },
  { id: "pixels-native", image: SCREEN, coordinates: { kind: "image-pixels" } },
  {
    id: "normalized-1000",
    image: { width: 1280, height: 720 },
    coordinates: { kind: "normalized", max: 1000 },
  },
  {
    id: "normalized-999",
    image: { width: 1280, height: 720 },
    coordinates: { kind: "normalized", max: 999 },
  },
] as const satisfies readonly ScreenProfile[];
function dimensions(profile: ScreenProfile) {
  if (
    !Number.isInteger(profile.image.width) ||
    !Number.isInteger(profile.image.height) ||
    profile.image.width < 1 ||
    profile.image.height < 1 ||
    profile.image.width * SCREEN.height !== profile.image.height * SCREEN.width
  )
    throw new RangeError("Screenshot dimensions must have the display's 16:9 aspect ratio");
  if (profile.coordinates.kind === "normalized") {
    if (!Number.isInteger(profile.coordinates.max) || profile.coordinates.max < 1)
      throw new RangeError("Normalized maximum must be a positive integer");
    return { x: profile.coordinates.max, y: profile.coordinates.max };
  }
  return { x: profile.image.width, y: profile.image.height };
}
function finite(point: Point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Coordinates must be finite");
}
const bound = (n: number, max: number) => Math.min(max, Math.max(0, n));
const clamp = (n: number, max: number) => bound(Math.round(n), max);
/** Image pixels use dimension ratios (e.g. exactly 0.8); normalized endpoints span
 * the valid display pixels 0..1599 and 0..899, including both endpoints. */
export function toScreen(point: Point, profile: ScreenProfile): Point {
  finite(point);
  const size = dimensions(profile);
  const normalized = profile.coordinates.kind === "normalized";
  return {
    x: clamp((point.x * (SCREEN.width - (normalized ? 1 : 0))) / size.x, SCREEN.width - 1),
    y: clamp((point.y * (SCREEN.height - (normalized ? 1 : 0))) / size.y, SCREEN.height - 1),
  };
}
export function toModel(point: Point, profile: ScreenProfile): Point {
  finite(point);
  const size = dimensions(profile);
  const normalized = profile.coordinates.kind === "normalized";
  return {
    x: clamp(
      (bound(point.x, SCREEN.width - 1) * size.x) / (SCREEN.width - (normalized ? 1 : 0)),
      normalized ? size.x : size.x - 1,
    ),
    y: clamp(
      (bound(point.y, SCREEN.height - 1) * size.y) / (SCREEN.height - (normalized ? 1 : 0)),
      normalized ? size.y : size.y - 1,
    ),
  };
}
export function screenshotScale(profile: ScreenProfile): number {
  dimensions(profile);
  return profile.image.width / SCREEN.width;
}
