import { type ExtractedDocument, fullCoverage, type SourceInput } from "./types.ts";
import { sectionsFromMarkdown } from "./markdown.ts";

export const extractTextDocument = (bytes: Uint8Array, source: SourceInput): ExtractedDocument => {
  const text = new TextDecoder().decode(bytes).trim();
  return {
    title: source.title,
    sections: sectionsFromMarkdown(text),
    coverage: fullCoverage("text"),
  };
};
