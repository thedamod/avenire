import type { LibraryFile } from "@avenire/contracts";
import { View } from "react-native";
import { FileIcon, Pressable, Text } from "../../../ui";
import { colors } from "../../../theme/tokens";
import { citationLabel, type Citation } from "./model";

export function CitationChip({
  citation,
  file,
  onOpen,
}: {
  citation: Citation;
  file?: LibraryFile | undefined;
  onOpen: (citation: Citation) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open citation: ${citationLabel(citation)}`}
      onPress={() => onOpen(citation)}
      style={{ minHeight: 44, justifyContent: "center", maxWidth: "100%", alignSelf: "flex-start" }}
    >
      <View
        style={{
          minHeight: 26,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: colors["line-2"],
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          gap: 6,
          paddingVertical: 4,
        }}
      >
        <FileIcon
          type={
            file?.kind === "web-page"
              ? "web"
              : (file?.kind ?? (citation.time !== undefined ? "video" : "pdf"))
          }
          {...(file?.sourceUrl ? { url: file.sourceUrl } : {})}
          size={13}
        />
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, lineHeight: 16, color: colors["fg-2"], flexShrink: 1 }}
        >
          {citationLabel(citation)}
        </Text>
      </View>
    </Pressable>
  );
}
