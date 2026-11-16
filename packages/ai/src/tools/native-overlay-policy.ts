import type { PageContext } from "@avenire/contracts";
/** Presentation capabilities are per-client/per-capture; mobile does not claim Qt 3D support. */
export function nativeOverlaySupport(turn: {
  page: Pick<PageContext, "surface" | "platform">;
  nativeScreenCapturedAt?: string | undefined;
  nativeAnnotationAvailable?: boolean | undefined;
  nativePresentation?: unknown;
}) {
  const active = Boolean(turn.nativeScreenCapturedAt) && turn.page.surface === "ephemeral";
  const desktop = active && turn.page.platform === "desktop" && Boolean(turn.nativePresentation);
  return {
    desktop,
    annotate:
      desktop ||
      (active && turn.page.platform === "mobile" && turn.nativeAnnotationAvailable === true),
  };
}
