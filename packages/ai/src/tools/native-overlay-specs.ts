/** Declarative local presentation. The server never connects directly to a user's desktop. */
import {
  DesktopOverlayAnnotation,
  DesktopNativeScene,
  DesktopNativeDiagram,
  DesktopCursorPosition,
  DesktopPresentationObservation,
} from "@avenire/contracts";
import { tool } from "ai";
import * as Schema from "effect/Schema";
import { standardSchema, standardObjectSchema } from "./schema.ts";

/** Client-side tool: pixels travel only in the immediate continuation request, not chat history. */
export const readScreenSpec = {
  description:
    "Read a fresh screenshot of the user's local display when their question depends on visible material, such as 'this muscle'. Use only when needed; do not read for unrelated questions or continuously monitor. The client applies capture privacy policy and excludes the prompt and AI overlays; capture can fail when privacy or display identity cannot be established. Describe what you see in your reply; use native annotations only when those tools are available. This is the local screen; screen_read/computer refer to a separate cloud desktop.",
  inputSchema: standardObjectSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({
      capturedAt: Schema.String,
      width: Schema.Int,
      height: Schema.Int,
    }),
  ),
};

export const nativeAnnotateSpec = {
  description:
    "Draw passive annotations over the user's current screen while explaining it. " +
    "Use normalized 0..1 coordinates relative to the attached full-display screenshot. " +
    "Choose a cursor with text to point at and explain a region, a rect highlight, an arrow (width/height point down and right), or a label. Every text annotation appears in a compact readable bubble with a leader. Prefer short labels and restrained warm or neutral colors. " +
    "Replace the current annotation set with at most 32 items; an empty array clears it. " +
    "Use short, complete explanatory labels; the client preserves their text as a fallback if rendering fails. If annotations contain only shapes, explain them in chat. Keep annotations small and relevant, and never obscure the material. " +
    "This requests local presentation; it does not click, type, change documents, or verify display. " +
    "The client applies it only while the matching screen capture is still active.",
  inputSchema: standardObjectSchema(
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
    "For a cart-pole explanation prefer native_diagram. Show a small interactive native 3D explanation over the user's screen. Supply 1..32 colored primitive objects (cube, sphere, cylinder, cone, plane) with position, Euler rotation in degrees and scale vectors. A unit primitive is about 100 scene units. Use a concise title and cameraDistance 200..1500. The user can drag or use arrow keys to rotate. This requests local presentation for the current capture; it does not verify rendering. Include a concise explanation in chat so it remains useful if the figure cannot be displayed. No executable code or external assets are supported.",
  inputSchema: standardObjectSchema(
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
export const nativeDiagramSpec = {
  description:
    "Show a transparent 2D cart-pole explanation with angle, cart position, pole length and force indicator. Choose light/dark ink to contrast with the screenshot. This is direct-manipulation geometry, not a physics/controller simulation. The user can drag or use arrow keys when interactive. Update parameters with another request to change the model. Current user adjustments are observed on the next submitted turn through native_presentation; execution is requested, not attested by this server tool. Include a concise chat explanation so the answer remains useful if the figure cannot be displayed. No external code/assets or desktop clicks are supported.",
  inputSchema: standardObjectSchema(
    Schema.Struct({ diagram: DesktopNativeDiagram, interactive: Schema.Boolean }),
  ),
  outputSchema: standardSchema(
    Schema.Struct({
      requested: Schema.Literal(true),
      capturedAt: Schema.String,
      diagram: DesktopNativeDiagram,
      interactive: Schema.Boolean,
    }),
  ),
};
export const nativeCursorSpec = {
  description:
    "Read the pointer observation attached to this turn, normally refreshed when the user submits. Check observedAt for its actual age. Returns global desktop coordinates in Qt logical pixels, normalized screenshot coordinates when inBounds, and observedAt. This is a read-only per-turn observation, not a live stream or cursor movement.",
  inputSchema: standardObjectSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({ capturedAt: Schema.String, position: DesktopCursorPosition }),
  ),
};
export const nativePresentationSpec = {
  description:
    "Read the native diagram/scene state observed at the start of this turn, including user-adjusted cart-pole parameters or 3D rotation. Use native_diagram or native_visualize to request a change. This observation is not continuous live execution feedback.",
  inputSchema: standardObjectSchema(Schema.Struct({})),
  outputSchema: standardSchema(
    Schema.Struct({ capturedAt: Schema.String, presentation: DesktopPresentationObservation }),
  ),
};

export const nativeOverlayToolSpecs = {
  read_screen: tool(readScreenSpec),
  native_annotate: tool(nativeAnnotateSpec),
  native_visualize: tool(nativeVisualizeSpec),
  native_diagram: tool(nativeDiagramSpec),
  native_cursor: tool(nativeCursorSpec),
  native_presentation: tool(nativePresentationSpec),
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

export const createNativeDiagramTool = (capturedAt: string) =>
  tool({
    ...nativeDiagramSpec,
    execute: ({ diagram, interactive }) => ({
      requested: true as const,
      capturedAt,
      diagram,
      interactive,
    }),
  });
export const createNativeCursorTool = (capturedAt: string, position: DesktopCursorPosition) =>
  tool({
    ...nativeCursorSpec,
    execute: () => ({ capturedAt, position }),
  });
export const createNativePresentationTool = (
  capturedAt: string,
  presentation: DesktopPresentationObservation,
) =>
  tool({
    ...nativePresentationSpec,
    execute: () => ({ capturedAt, presentation }),
  });
