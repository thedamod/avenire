/** Shared screenshot transport for chat previews and future Cloud computer use. */
import type { ModelMessage, ToolResultPart } from "ai";
type ToolResultOutput = ToolResultPart["output"];
import type { ModelCapabilities } from "../models/index.ts";

export interface ToolImage {
  readonly id: string;
  /** Base64 keeps persisted tool/UI results JSON serializable. Producers accept PNG bytes. */
  readonly data: string;
  readonly mediaType: "image/png";
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}
export const pngImage = (
  bytes: Uint8Array,
  metadata: { id: string; width: number; height: number },
): ToolImage => ({
  ...metadata,
  data: Buffer.from(bytes).toString("base64"),
  mediaType: "image/png",
  sizeBytes: bytes.byteLength,
});
export const imageInResult = (output: unknown): ToolImage | undefined => {
  if (typeof output !== "object" || output === null || !("screenshot" in output)) return;
  const image = output.screenshot;
  if (
    typeof image !== "object" ||
    image === null ||
    !("id" in image) ||
    !("data" in image) ||
    !("mediaType" in image) ||
    !("sizeBytes" in image) ||
    !("width" in image) ||
    !("height" in image)
  )
    return;
  if (
    typeof image.id !== "string" ||
    typeof image.data !== "string" ||
    image.mediaType !== "image/png" ||
    typeof image.sizeBytes !== "number" ||
    typeof image.width !== "number" ||
    typeof image.height !== "number"
  )
    return;
  return {
    id: image.id,
    data: image.data,
    mediaType: image.mediaType,
    sizeBytes: image.sizeBytes,
    width: image.width,
    height: image.height,
  };
};
const resultText = (output: unknown): string =>
  JSON.stringify(
    typeof output === "object" && output !== null
      ? Object.fromEntries(Object.entries(output).filter(([key]) => key !== "screenshot"))
      : output,
  ) ?? "Tool completed.";
export const imageModelOutput = (
  output: unknown,
  capability: ModelCapabilities,
): ToolResultOutput => {
  const image = imageInResult(output);
  const text = resultText(output);
  if (!image) return { type: "text", value: text };
  const caption = `${text}\nScreenshot ${image.id}: ${image.width}×${image.height}, ${image.sizeBytes} bytes.`;
  if (!capability.vision)
    return {
      type: "text",
      value: `${caption}\nThis model cannot inspect images; use the text diagnostics.`,
    };
  if (!capability.toolResultImages)
    return { type: "text", value: `${caption}\nScreenshot attached in the next message.` };
  return {
    type: "content",
    value: [
      { type: "text", text: caption },
      {
        type: "file",
        data: { type: "data", data: image.data },
        mediaType: image.mediaType,
        filename: `${image.id}.png`,
      },
    ],
  };
};
/** Remove only image payloads, preserving text, tool ids and non-image files. */
export const pruneModelImages = (
  messages: ReadonlyArray<ModelMessage>,
  maximum: number,
): ModelMessage[] => {
  let remaining = Math.max(0, Math.floor(maximum));
  const keep = () => remaining-- > 0;
  return messages
    .toReversed()
    .map((message): ModelMessage => {
      if (message.role === "tool")
        return {
          ...message,
          content: message.content
            .toReversed()
            .map((part) => {
              if (part.type !== "tool-result" || part.output.type !== "content") return part;
              const value = part.output.value
                .toReversed()
                .filter((p) => p.type !== "file" || !p.mediaType.startsWith("image/") || keep())
                .toReversed();
              return { ...part, output: { ...part.output, value } };
            })
            .toReversed(),
        };
      if (message.role === "user" && Array.isArray(message.content)) {
        const content = message.content
          .toReversed()
          .filter(
            (part) =>
              (part.type !== "image" &&
                !(part.type === "file" && part.mediaType.startsWith("image/"))) ||
              keep(),
          )
          .toReversed();
        return {
          ...message,
          content: content.length
            ? content
            : [{ type: "text", text: "Earlier image omitted from model history." }],
        };
      }
      if (message.role === "assistant" && Array.isArray(message.content)) {
        const content = message.content
          .toReversed()
          .filter(
            (part) => !(part.type === "file" && part.mediaType.startsWith("image/")) || keep(),
          )
          .toReversed();
        return {
          ...message,
          content: content.length
            ? content
            : [{ type: "text", text: "Earlier image omitted from model history." }],
        };
      }
      return message;
    })
    .toReversed();
};
/** Queue is turn-local. the adapter queues fallback images once by id.
 * prepareStep retains injected messages across later steps and prunes before every call.
 */
export const createImageTransport = (capability: ModelCapabilities, maxImages = 3) => {
  const queued = new Map<string, ToolImage>();
  const seen = new Set<string>();
  const attach = (output: unknown) => {
    const image = imageInResult(output);
    if (image && capability.vision && !capability.toolResultImages && !seen.has(image.id)) {
      queued.set(image.id, image);
      seen.add(image.id);
    }
  };
  const following = (image: ToolImage): ModelMessage => ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Screenshot ${image.id} (${image.sizeBytes} bytes) from the preceding tool result.`,
      },
      { type: "file", data: { type: "data", data: image.data }, mediaType: image.mediaType },
    ],
  });
  const prepareMessages = (messages: ReadonlyArray<ModelMessage>): ModelMessage[] => {
    const pending = new Map(queued);
    queued.clear();
    const expanded = messages.flatMap((message): ModelMessage[] => {
      if (message.role !== "tool") return [message];
      const next: ModelMessage[] = [];
      for (const part of message.content) {
        if (part.type !== "tool-result" || part.output.type !== "text") continue;
        for (const [id, image] of pending) {
          if (part.output.value.includes(`Screenshot ${id}:`)) {
            next.push(following(image));
            pending.delete(id);
          }
        }
      }
      return [message, ...next];
    });
    // The SDK carries prepared messages into later steps; drain the queue once to avoid duplicates.
    return pruneModelImages(
      [...expanded, ...[...pending.values()].map(following)],
      capability.vision ? maxImages : 0,
    );
  };
  return {
    attach,
    toModelOutput: ({ output }: { output: unknown }) => {
      attach(output);
      return imageModelOutput(output, capability);
    },
    prepareMessages,
  };
};
export type ImageTransport = ReturnType<typeof createImageTransport>;
