import { SheetError as ErrorState } from "./SheetError";
import { Fragment, useMemo } from "react";
import type { FileId, LibraryFile } from "@avenire/contracts";
import { View } from "react-native";
import { Aside, Button, Icon, Markdown, SkeletonRow, Text, errorMessage } from "../../../ui";
import { colors } from "../../../theme/tokens";
import { CitationChip } from "../citations/CitationChip";
import { sourceLink, type Citation } from "../citations/model";
import { useOutputNote } from "./data";

/** Keep the shared Markdown renderer; citation links become native source chips locally. */
export function CitedMarkdown({
  value,
  citations,
  fileById,
  onCitation,
}: {
  value: string;
  citations: ReadonlyMap<string, Citation>;
  fileById: ReadonlyMap<FileId, LibraryFile>;
  onCitation: (citation: Citation) => void;
}) {
  const parts = useMemo(() => {
    const escaped = [...citations.keys()]
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(
      `\\[([^\\]]+)\\]\\(([^)]+)\\)${escaped.length ? `|${escaped.join("|")}` : ""}`,
      "g",
    );
    const result: ({ text: string } | { citation: Citation })[] = [];
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      const citation = match[2]
        ? match[2].startsWith("cite:")
          ? citations.get(match[2].slice(5))
          : sourceLink(match[2], match[1]!)
        : citations.get(match[0]);
      if (!citation) continue;
      if (match.index > offset)
        result.push({ text: value.slice(offset, match.index).replace(/[\[(`【]\s*$/, "") });
      result.push({ citation });
      offset = match.index + match[0].length;
      if (/^[\])`】]/.test(value.slice(offset))) offset++;
    }
    if (offset < value.length) result.push({ text: value.slice(offset) });
    return result;
  }, [value, citations]);
  return (
    <View>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {"citation" in part ? (
            <CitationChip
              citation={part.citation}
              file={fileById.get(part.citation.sourceId)}
              onOpen={onCitation}
            />
          ) : part.text.trim() ? (
            <Markdown value={part.text} size="note" />
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}

export function NoteOutput({
  fileId,
  startHere,
  createdAt,
  sourceCount,
  citations,
  fileById,
  onCitation,
  onOpenNote,
}: {
  fileId: FileId;
  startHere?: string | null | undefined;
  createdAt?: string | undefined;
  sourceCount: number;
  citations: ReadonlyMap<string, Citation>;
  fileById: ReadonlyMap<FileId, LibraryFile>;
  onCitation: (citation: Citation) => void;
  onOpenNote: (fileId: FileId) => void;
}) {
  const note = useOutputNote(fileId);
  if (note.loading)
    return (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  if (note.error)
    return <ErrorState message={errorMessage(note.error)} onRetry={() => void note.refetch()} />;
  if (!note.data) return null;
  const match = /^\s*#\s+(.+)\r?\n+/.exec(note.data.markdown);
  const title = match?.[1]?.trim() ?? note.data.title;
  const markdown = match ? note.data.markdown.slice(match[0].length) : note.data.markdown;
  const time = createdAt
    ? new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;
  return (
    <View style={{ gap: 14 }}>
      {startHere ? (
        <Aside color={colors.accent}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Icon name="moon" size={14} color={colors["accent-text"]} />
            <Text color="accent-text" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
              {startHere}
            </Text>
          </View>
        </Aside>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 22,
            lineHeight: 28,
            fontWeight: "600",
            letterSpacing: -0.22,
            color: colors.fg,
          }}
        >
          {title}
        </Text>
        <Text variant="meta">{`Written overnight${sourceCount ? ` from ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}` : ""}${time ? ` · ${time}` : ""}`}</Text>
      </View>
      <CitedMarkdown
        value={markdown}
        citations={citations}
        fileById={fileById}
        onCitation={onCitation}
      />
      <Button
        variant="link"
        accessibilityLabel={`Open note: ${title}`}
        hitSlop={6}
        style={{ alignSelf: "flex-start" }}
        onPress={() => onOpenNote(fileId)}
      >
        Open note ↗
      </Button>
    </View>
  );
}
