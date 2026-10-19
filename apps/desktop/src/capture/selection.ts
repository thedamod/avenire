/** Clipboard contents have no relationship to the source under the capture hotkey.
 * Selection is captured only by source-aware collectors (for example, a browser tab).
 */
export async function collectSelection(): Promise<{ readonly selectionText?: string }> {
  return {};
}
