import { memo } from "react";
import { Markdown } from "../../../ui";
import { CitedMarkdown } from "./CitedMarkdown";
import { linkCitations, type Citation, type CitationMap } from "./citations";

export const AssistantMessage = memo(function AssistantMessage({ text, citations, onCitation }: { text: string; citations: CitationMap; onCitation: (citation: Citation) => void }) {
  const linked = linkCitations(text, citations);
  return linked.includes("cite:") ? <CitedMarkdown value={linked} size="chat" citations={citations} onCitation={onCitation} /> : <Markdown value={text} size="chat" />;
});
