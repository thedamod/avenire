import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import type {
  FileId,
  FolderId,
  LibraryFile,
  SearchHit,
} from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import type { RootNavigation } from "../../navigation";
import {
  EmptyState,
  ErrorState,
  Icon,
  Pressable,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { SourceIcon } from "../home/SourcesTab";
import { timestamp } from "../home/data";
import { useAskSearch } from "./data";

export function SearchResults({
  query,
  folderId,
  fileIds,
  files,
  navigation,
  onCount,
}: {
  query: string;
  folderId: FolderId | null;
  fileIds: readonly FileId[];
  files: readonly LibraryFile[] | undefined;
  navigation: RootNavigation;
  onCount: (count: number | undefined) => void;
}) {
  const result = useAskSearch(query, folderId, fileIds);
  const count = result.hits?.length;
  useEffect(() => {
    onCount(count);
  }, [count, onCount]);
  if (result.error && !result.data)
    return (
      <View style={{ padding: 20 }}>
        <ErrorState
          message={errorMessage(result.error)}
          onRetry={() => void result.refetch()}
        />
      </View>
    );
  if (!result.hits)
    return (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  if (!result.hits.length)
    return (
      <EmptyState
        title="No matching files."
        description="Try another search, or tap Ask Ava for an explanation."
      />
    );
  const fileById = new Map(files?.map((file) => [file.id, file]));
  return (
    <>
      {result.hits.map((hit) => {
        const file = fileById.get(hit.fileId);
        const location = hitLocation(hit);
        const page = hit.location.page ?? hit.location.slide;
        const open = () =>
          hit.fileKind === "note"
            ? navigation.navigate("Note", { fileId: hit.fileId })
            : navigation.navigate("Citation", {
                sourceId: hit.fileId,
                ...(page !== undefined ? { page } : {}),
                ...(hit.location.startSec !== undefined
                  ? { time: hit.location.startSec }
                  : {}),
              });
        return (
          <Pressable
            key={hit.chunkId}
            accessibilityRole="button"
            accessibilityLabel={`Open ${hit.fileTitle}${location ? `, ${location}` : ""}`}
            accessibilityHint="Long press to select sources"
            onPress={open}
            onLongPress={() =>
              navigation.navigate("SourcesSelect", {
                selectedIds: [hit.fileId],
              })
            }
            style={styles.row}
          >
            <Thumbnail hit={hit} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
              >
                <SourceIcon
                  file={{
                    kind: hit.fileKind,
                    sourceUrl: file?.sourceUrl ?? null,
                  }}
                  size={14}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 15,
                    lineHeight: 20,
                    fontWeight: "600",
                    color: "#EDEDED",
                  }}
                >
                  {hit.fileTitle}
                </Text>
              </View>
              {location ? <Text variant="meta">{location}</Text> : null}
              <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
                {hit.content.replace(/\s+/g, " ").trim()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
export function hitLocation(hit: SearchHit): string | undefined {
  const location = hit.location;
  if (location.page !== undefined) return `Page ${location.page}`;
  if (location.slide !== undefined) return `Slide ${location.slide}`;
  if (location.startSec !== undefined)
    return `${timestamp(location.startSec)}${location.endSec !== undefined ? ` – ${timestamp(location.endSec)}` : ""}`;
  if (location.heading) return `§ ${location.heading}`;
  if (location.sheet) return `Sheet ${location.sheet}`;
  return hit.fileKind === "note" ? "Note" : undefined;
}
function ImageThumbnail({ fileId }: { fileId: FileId }) {
  const result = useQuery(
    (client) => client["library.getFileContentUrl"]({ fileId }),
    `search-thumbnail-${fileId}`,
  );
  return result.data ? (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: result.data.url }}
      style={styles.thumbnail}
    />
  ) : (
    <View style={[styles.thumbnail, styles.center]}>
      <Icon name="image" size={22} />
    </View>
  );
}
function Thumbnail({ hit }: { hit: SearchHit }) {
  if (hit.fileKind === "image") return <ImageThumbnail fileId={hit.fileId} />;
  if (hit.fileKind === "video" || hit.fileKind === "audio")
    return (
      <View style={[styles.thumbnail, styles.center]}>
        <Icon name={hit.fileKind === "video" ? "video" : "mic"} size={24} />
        {hit.location.startSec !== undefined ? (
          <View
            style={{
              position: "absolute",
              bottom: 3,
              right: 3,
              backgroundColor: "#000000CC",
              paddingHorizontal: 4,
              borderRadius: 3,
            }}
          >
            <Text
              variant="mono"
              color="#FFFFFF"
              style={{ fontSize: 9, lineHeight: 13 }}
            >
              {timestamp(hit.location.startSec)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  // A content preview, rather than pretending an unavailable page raster is real.
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.thumbnail,
        {
          backgroundColor: "#F3F2EC",
          paddingHorizontal: 7,
          paddingVertical: 8,
          gap: 4,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: 4,
          lineHeight: 5,
          fontWeight: "600",
          color: "#1A1A1A",
        }}
      >
        {hit.fileTitle}
      </Text>
      <Text
        numberOfLines={8}
        style={{ fontSize: 3.5, lineHeight: 5.5, color: "#66665F" }}
      >
        {hit.content}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  thumbnail: {
    width: 60,
    height: 76,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#141418",
  },
  center: { alignItems: "center", justifyContent: "center" },
});
