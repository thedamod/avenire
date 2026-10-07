import type { ExtractedSection } from "./types.ts";

/** Split prose at ATX headings and keep the full heading path for citations. */
export const sectionsFromMarkdown = (markdown: string): ReadonlyArray<ExtractedSection> => {
  const sections: Array<ExtractedSection> = [];
  const headings: Array<string> = [];
  let lines: Array<string> = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) {
      const heading = headings.filter(Boolean).join(" › ");
      sections.push({ text, location: heading ? { heading } : {} });
    }
    lines = [];
  };
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
    if (match) {
      flush();
      headings.length = match[1]?.length ?? 0;
      headings[(match[1]?.length ?? 1) - 1] = match[2]?.trim() ?? "";
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
};
