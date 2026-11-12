/** Local native presentation contract. The Qt process receives only these bounded commands. */
import * as Schema from "effect/Schema";

export const DesktopOverlayPhase = Schema.Literals(["idle", "thinking", "error"]);
export type DesktopOverlayPhase = typeof DesktopOverlayPhase.Type;

export const DesktopOverlayAnnotation = Schema.Struct({
  id: Schema.String.check(Schema.isMaxLength(100)),
  kind: Schema.Literals(["rect", "arrow", "label", "cursor"]),
  x: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  y: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  width: Schema.optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  height: Schema.optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  color: Schema.optional(Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i))),
});
export type DesktopOverlayAnnotation = typeof DesktopOverlayAnnotation.Type;

/** Read-only pointer observation. x/y are normalized to the selected capture bounds. */
export const DesktopCursorPosition = Schema.Struct({
  globalX: Schema.Int,
  globalY: Schema.Int,
  screenId: Schema.String.check(Schema.isMaxLength(200)),
  inBounds: Schema.Boolean,
  x: Schema.optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  y: Schema.optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  observedAt: Schema.String.check(Schema.isMaxLength(100)),
});
export type DesktopCursorPosition = typeof DesktopCursorPosition.Type;

/** Native direct-manipulation geometry, rather than an unconstrained script or simulation. */
export const DesktopNativeDiagram = Schema.Struct({
  kind: Schema.Literal("cart-pole"),
  title: Schema.String.check(Schema.isMaxLength(100)),
  angleDegrees: Schema.Finite.check(Schema.isBetween({ minimum: -75, maximum: 75 })),
  cartPosition: Schema.Finite.check(Schema.isBetween({ minimum: -1, maximum: 1 })),
  poleLength: Schema.Finite.check(Schema.isBetween({ minimum: 0.5, maximum: 3 })),
  showForce: Schema.Boolean,
  theme: Schema.Literals(["light", "dark"]),
});
export type DesktopNativeDiagram = typeof DesktopNativeDiagram.Type;

export const DesktopPresentationObservation = Schema.Struct({
  mode: Schema.Literals(["3d", "cart-pole"]),
  visible: Schema.Boolean,
  interactive: Schema.Boolean,
  title: Schema.String.check(Schema.isMaxLength(100)),
  diagram: Schema.optional(DesktopNativeDiagram),
  rotationX: Schema.optional(Schema.Finite),
  rotationY: Schema.optional(Schema.Finite),
  observedAt: Schema.String.check(Schema.isMaxLength(100)),
});
export type DesktopPresentationObservation = typeof DesktopPresentationObservation.Type;
export const DesktopNativeObservation = Schema.Struct({
  cursor: DesktopCursorPosition,
  presentation: DesktopPresentationObservation,
});
export type DesktopNativeObservation = typeof DesktopNativeObservation.Type;

export const DesktopScreenObservation = Schema.Struct({
  mimeType: Schema.Literal("image/png"),
  data: Schema.String.check(Schema.isMaxLength(1_048_576)),
  width: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8192 })),
  height: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8192 })),
  screenId: Schema.String.check(Schema.isMaxLength(200)),
  capturedAt: Schema.String.check(Schema.isMaxLength(100)),
  cursor: Schema.optional(DesktopCursorPosition),
  presentation: Schema.optional(DesktopPresentationObservation),
});
export type DesktopScreenObservation = typeof DesktopScreenObservation.Type;

export const DesktopOverlayState = Schema.Struct({
  phase: DesktopOverlayPhase,
  reducedMotion: Schema.optional(Schema.Boolean),
});
export type DesktopOverlayState = typeof DesktopOverlayState.Type;

export const DesktopPromptCaptureContext = Schema.Struct({
  sessionId: Schema.Int,
  capture: Schema.NullOr(DesktopScreenObservation),
  error: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
});
export type DesktopPromptCaptureContext = typeof DesktopPromptCaptureContext.Type;

const NativePosition = Schema.Tuple([
  Schema.Finite.check(Schema.isBetween({ minimum: -500, maximum: 500 })),
  Schema.Finite.check(Schema.isBetween({ minimum: -500, maximum: 500 })),
  Schema.Finite.check(Schema.isBetween({ minimum: -500, maximum: 500 })),
]);
const NativeScale = Schema.Tuple([
  Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 20 })),
  Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 20 })),
  Schema.Finite.check(Schema.isBetween({ minimum: 0.01, maximum: 20 })),
]);
export const DesktopNativeScene = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(100)),
  cameraDistance: Schema.Finite.check(Schema.isBetween({ minimum: 200, maximum: 1500 })),
  objects: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(Schema.isMaxLength(100)),
      shape: Schema.Literals(["cube", "sphere", "cylinder", "cone", "plane"]),
      position: NativePosition,
      rotation: NativePosition,
      scale: NativeScale,
      color: Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/i)),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
});
export type DesktopNativeScene = typeof DesktopNativeScene.Type;

export const ScreenSharingDisabled = Schema.Struct({
  status: Schema.Literal("disabled"),
  message: Schema.Literal(
    "Screen sharing is off. Enable Share screen with Ava in Settings → Capture to let me explain what’s on your screen.",
  ),
});
export type ScreenSharingDisabled = typeof ScreenSharingDisabled.Type;
export const ReadScreenResult = Schema.Union([
  ScreenSharingDisabled,
  Schema.Struct({
    status: Schema.Literal("captured"),
    capturedAt: Schema.String,
    width: Schema.Int,
    height: Schema.Int,
  }),
]);
export const DesktopReadScreenResult = Schema.Union([
  ScreenSharingDisabled,
  DesktopPromptCaptureContext,
]);
export type DesktopReadScreenResult = typeof DesktopReadScreenResult.Type;
