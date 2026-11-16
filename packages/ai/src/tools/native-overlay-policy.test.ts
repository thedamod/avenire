import { expect, it } from "vite-plus/test";
import { nativeOverlaySupport } from "./native-overlay-policy.ts";
it("mobile gets annotations for an active capture without pretending to support Qt scenes", () => {
  expect(
    nativeOverlaySupport({
      page: { surface: "ephemeral", platform: "mobile" },
      nativeScreenCapturedAt: "now",
      nativeAnnotationAvailable: true,
    }),
  ).toEqual({ annotate: true, desktop: false });
});
it("refuses missing captures, non-ephemeral contexts, and web capability claims", () => {
  for (const turn of [
    { page: { surface: "ephemeral", platform: "mobile" }, nativeAnnotationAvailable: true },
    {
      page: { surface: "chat", platform: "mobile" },
      nativeScreenCapturedAt: "now",
      nativeAnnotationAvailable: true,
    },
    {
      page: { surface: "ephemeral", platform: "web" },
      nativeScreenCapturedAt: "now",
      nativeAnnotationAvailable: true,
    },
  ] as const)
    expect(nativeOverlaySupport(turn)).toEqual({ annotate: false, desktop: false });
});
it("preserves the desktop presentation requirement", () => {
  expect(
    nativeOverlaySupport({
      page: { surface: "ephemeral", platform: "desktop" },
      nativeScreenCapturedAt: "now",
      nativePresentation: {},
    }),
  ).toEqual({ annotate: true, desktop: true });
  expect(
    nativeOverlaySupport({
      page: { surface: "ephemeral", platform: "desktop" },
      nativeScreenCapturedAt: "now",
    }),
  ).toEqual({ annotate: false, desktop: false });
});
