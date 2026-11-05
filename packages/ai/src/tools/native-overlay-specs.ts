/** Declarative local presentation. The server never connects directly to a user's desktop. */
import { DesktopOverlayAnnotation, DesktopNativeScene } from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema } from "./schema.ts";

export const nativeAnnotateSpec = {
  description:
    "Draw passive annotations over the user's current screen while explaining it. " +
    "Use normalized 0..1 coordinates relative to the attached full-display screenshot. " +
    "Choose rect, arrow (width/height point down and right), or plain-text label. " +
    "Replace the current annotation set with at most 32 items; an empty array clears it. " +
    "Keep annotations small and relevant, and never obscure the material. " +
    "This requests local presentation; it does not click, type, change documents, or verify display. " +
    "The client applies it only while the matching screen capture is still active.",
  inputSchema: standardSchema(
    Schema.Struct({ items: Schema.Array(DesktopOverlayAnnotation).check(Schema.isMaxLength(32)) }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      requested: Schema.Literal(true),
      capturedAt: Schema.String,
      items: Schema.Array(DesktopOverlayAnnotation),
    }),
  ),
};
export const nativeVisualizeSpec = {
  description:
    "Show a small interactive native 3D explanation over the user's screen. Supply 1..32 colored primitive objects (cube, sphere, cylinder, cone, plane) with position, Euler rotation in degrees and scale vectors. A unit primitive is about 100 scene units. Use a concise title and cameraDistance 200..1500. The user can drag or use arrow keys to rotate. This requests local presentation for the current capture; it does not verify rendering. No executable code or external assets are supported.",
  inputSchema: standardSchema(
    Schema.Struct({ scene: DesktopNativeScene, interactive: Schema.Boolean }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      requested: Schema.Literal(true),
      capturedAt: Schema.String,
      scene: DesktopNativeScene,
      interactive: Schema.Boolean,
    }),
  ),
};
export const nativeOverlayToolSpecs = {
  native_annotate: tool(nativeAnnotateSpec),
  native_visualize: tool(nativeVisualizeSpec),
};

export const createNativeAnnotationTool = (capturedAt: string) =>
  tool({
    ...nativeAnnotateSpec,
    execute: ({ items }) => ({ requested: true as const, capturedAt, items }),
  });

export const createNativeVisualizationTool = (capturedAt: string) =>
  tool({
    ...nativeVisualizeSpec,
    execute: ({ scene, interactive }) => ({
      requested: true as const,
      capturedAt,
      scene,
      interactive,
    }),
  });
