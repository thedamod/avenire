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

export const DesktopScreenObservation = Schema.Struct({
  mimeType: Schema.Literal("image/png"),
  data: Schema.String.check(Schema.isMaxLength(1_048_576)),
  width: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8192 })),
  height: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8192 })),
  screenId: Schema.String.check(Schema.isMaxLength(200)),
  capturedAt: Schema.String.check(Schema.isMaxLength(100)),
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
