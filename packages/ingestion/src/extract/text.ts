import type { ExtractedDocument } from "./types.ts";

export const extractTextDocument = (source: Uint8Array, title?: string): ExtractedDocument => {
  const text = new TextDecoder().decode(source).trim();
  return { ...(title ? { title } : {}), sections: text ? [{ text, location: {} }] : [] };
};
