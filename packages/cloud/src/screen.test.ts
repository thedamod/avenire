import { expect, it } from "@effect/vitest";
import {
  SCREEN,
  SCREEN_PROFILES,
  screenshotScale,
  toModel,
  toScreen,
  type ScreenProfile,
} from "./screen.ts";
it("uses exact aspect preserving image ratios", () => {
  expect(SCREEN).toEqual({ width: 1600, height: 900 });
  expect(SCREEN_PROFILES.map(screenshotScale)).toEqual([0.8, 0.64, 1, 0.8, 0.8]);
  expect(toScreen({ x: 640, y: 360 }, SCREEN_PROFILES[0])).toEqual({ x: 800, y: 450 });
  expect(toScreen({ x: 512, y: 288 }, SCREEN_PROFILES[1])).toEqual({ x: 800, y: 450 });
});
it("maps normalized inclusive endpoints to valid pixels", () => {
  for (const p of SCREEN_PROFILES) {
    if (p.coordinates.kind !== "normalized") continue;
    expect(toScreen({ x: p.coordinates.max, y: p.coordinates.max }, p)).toEqual({
      x: 1599,
      y: 899,
    });
    expect(toModel({ x: 1599, y: 899 }, p)).toEqual({ x: p.coordinates.max, y: p.coordinates.max });
  }
});
it("clamps both spaces and rounds fractional coordinates", () => {
  for (const p of SCREEN_PROFILES) {
    expect(toScreen({ x: -10, y: -10 }, p)).toEqual({ x: 0, y: 0 });
    expect(toScreen({ x: 1e6, y: 1e6 }, p)).toEqual({ x: 1599, y: 899 });
    expect(toModel({ x: -10, y: -10 }, p)).toEqual({ x: 0, y: 0 });
  }
  expect(toScreen({ x: 10.5, y: 20.5 }, SCREEN_PROFILES[0])).toEqual({ x: 13, y: 26 });
  expect(toModel({ x: 1.6, y: 1.6 }, SCREEN_PROFILES[0])).toEqual({ x: 1, y: 1 });
});
it("round trips the full screen within one pixel and model unit", () => {
  for (const p of SCREEN_PROFILES)
    for (let x = 0; x < 1600; x += 17)
      for (let y = 0; y < 900; y += 19) {
        const model = toModel({ x, y }, p),
          screen = toScreen(model, p),
          again = toModel(screen, p);
        expect(Math.abs(screen.x - x)).toBeLessThanOrEqual(1);
        expect(Math.abs(screen.y - y)).toBeLessThanOrEqual(1);
        expect(Math.abs(again.x - model.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(again.y - model.y)).toBeLessThanOrEqual(1);
      }
});
it("rejects invalid dimensions and nonfinite inputs", () => {
  for (const point of [
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
  ]) {
    expect(() => toScreen(point, SCREEN_PROFILES[0])).toThrow(RangeError);
    expect(() => toModel(point, SCREEN_PROFILES[0])).toThrow(RangeError);
  }
  for (const p of [
    { ...SCREEN_PROFILES[0], image: { width: 1024, height: 768 } },
    { ...SCREEN_PROFILES[0], image: { width: 0, height: 0 } },
    { ...SCREEN_PROFILES[3], coordinates: { kind: "normalized", max: 0 } },
  ] as ScreenProfile[])
    expect(() => screenshotScale(p)).toThrow(RangeError);
});
