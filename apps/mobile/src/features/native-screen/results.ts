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
  const chunks: string[] = [];
  let current: string[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      if (!fence) fence = { marker: match[1]![0]!, length: match[1]!.length };
      else if (
        match[1]![0] === fence.marker &&
        match[1]!.length >= fence.length &&
        !match[2]!.trim()
      )
        fence = undefined;
    }
    if (!line.trim() && !fence) {
      if (current.length) chunks.push(current.join("\n").trim());
      current = [];
    } else current.push(line);
  }
  if (current.length) chunks.push(current.join("\n").trim());
  return chunks.at(-1) ?? "";
}
