import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ImageDescriber } from "./describe.ts";
import { type ExtractedDocument, type SourceInput, fullCoverage } from "./types.ts";

const imageMimeType = (bytes: Uint8Array, declared: string | null): string => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45)
    return "image/webp";
  return declared?.startsWith("image/") ? declared : "image/jpeg";
};

/** An image with visible text first, followed by a search-oriented description. */
const noDescription = (detail: string): ExtractedDocument["coverage"] => ({
  status: "none",
  parts: [{ part: "description", status: "none", detail }],
});

/** An image as one `figure` section: its visible text, then what it shows. */
export const extractImage = Effect.fn("extractImage")(function* (
  bytes: Uint8Array,
  source: SourceInput,
): Effect.fn.Return<ExtractedDocument, never, ImageDescriber> {
  const describer = yield* ImageDescriber;
  const described = yield* describer
    .describe({
      image: bytes,
      mimeType: imageMimeType(bytes, source.mimeType),
      context: source.title,
    })
    .pipe(
      Effect.tapError((error) => Effect.logWarning("Image description failed", error)),
      Effect.option,
    );
  const captureNote = source.origin?._tag === "Screen" ? source.origin.note?.trim() : undefined;
  if (Option.isNone(described)) {
    if (captureNote)
      return {
        title: source.title,
        sections: [{ text: `Capture note:\n${captureNote}`, kind: "other", location: {} }],
        coverage: {
          status: "partial",
          parts: [
            { part: "description", status: "none", detail: "Vision description failed" },
            { part: "note", status: "full" },
          ],
        },
      };
    return {
      title: source.title,
      sections: [],
      coverage: noDescription("Vision description failed"),
    };
  }
  const { text, description } = described.value;
  const note = source.origin?._tag === "Screen" ? source.origin.note?.trim() : undefined;
  const sections: ExtractedDocument["sections"] = [
    ...(text.trim() ? [{ text: text.trim(), kind: "slide" as const, location: {} }] : []),
    ...(description.trim()
      ? [
          {
            text: `Visual description (generated):\n${description.trim()}`,
            kind: "figure" as const,
            location: {},
          },
        ]
      : []),
    ...(note ? [{ text: `Capture note:\n${note}`, kind: "other" as const, location: {} }] : []),
  ];
  return {
    title: source.title,
    sections,
    coverage: sections.length
      ? {
          ...fullCoverage("description"),
          ...(source.origin?._tag === "Screen"
            ? {
                parts: [
                  {
                    part: "visible-screen",
                    status: "full" as const,
                    detail: "Only the captured screen; not the entire underlying document.",
                  },
                ],
              }
            : {}),
        }
      : noDescription("Nothing searchable in the image"),
  };
});
