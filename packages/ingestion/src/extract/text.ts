import { type ExtractedDocument, fullCoverage, type SourceInput } from "./types.ts";

export const extractTextDocument = (bytes: Uint8Array, source: SourceInput): ExtractedDocument => {
  const text = new TextDecoder().decode(bytes).trim();
  return {
    title: source.title,
    sections: text ? [{ text, location: {} }] : [],
    coverage: fullCoverage("text"),
  };
};
