/**
 * One-line ↔ stacked composer switch with hysteresis.
 *
 * The content is measured against a fixed reference (the inline layout's text width), never
 * the live layout, so the switch itself cannot change the measurement. It stacks when the
 * text would wrap at inline width or contains a newline, and unstacks only once the text fits
 * with `margin` px to spare. Typing at the boundary therefore never oscillates.
 */
export type ComposerLayout = "inline" | "stacked";

export interface ComposerMeasure {
  readonly text: string;
  /** Width of the text laid out on one line (a hidden `white-space: pre` mirror). */
  readonly contentWidth: number;
  /** Width the textarea has in the inline layout. */
  readonly inlineWidth: number;
}

export const UNSTACK_MARGIN_PX = 24;

export function nextComposerLayout(
  current: ComposerLayout,
  measure: ComposerMeasure,
  margin = UNSTACK_MARGIN_PX,
): ComposerLayout {
  if (measure.text.includes("\n")) return "stacked";
  if (measure.inlineWidth <= 0) return current;
  if (current === "inline")
    return measure.contentWidth > measure.inlineWidth ? "stacked" : "inline";
  return measure.contentWidth <= measure.inlineWidth - margin ? "inline" : "stacked";
}
