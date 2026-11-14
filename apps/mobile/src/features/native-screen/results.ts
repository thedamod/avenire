import { NativeAnnotationResult } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

/** Only validated, completed presentation requests are candidates; partial streams never draw. */
export function annotationResults(messages: readonly { parts: readonly unknown[] }[]) {
  const results: { callId: string; result: NativeAnnotationResult }[] = [];
  for (const message of messages)
    for (const part of message.parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (p.state !== "output-available" || typeof p.toolCallId !== "string") continue;
      if (
        p.type !== "tool-native_annotate" &&
        !(p.type === "dynamic-tool" && p.toolName === "native_annotate")
      )
        continue;
      const result = Schema.decodeUnknownOption(NativeAnnotationResult)(p.output);
      if (Option.isSome(result)) results.push({ callId: p.toolCallId, result: result.value });
    }
  return results;
}
export function annotationText(result: NativeAnnotationResult): string {
  return result.items
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** The dock is a glanceable answer; server-owned history remains complete. */
export function lastParagraph(text: string): string {
  return (
    text
      .trim()
      .split(/\r?\n[ \t]*\r?\n+/)
      .filter((paragraph) => paragraph.trim())
      .at(-1)
      ?.trim() ?? ""
  );
}
