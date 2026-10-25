import { FeatureErrorState as ErrorState } from "../notebook/FeatureUi";
import { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import type { LibraryFile } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { FileIcon, ScrollFade, SkeletonRow, Text, errorMessage } from "../../ui";
import { fileIconType } from "./data";
import { PdfSource } from "../chat/citations/SourceViews";
import { SourceDocument } from "./SourceDocument";

function MediaSource({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} nativeControls style={{ flex: 1 }} contentFit="contain" />;
}
function SourcePane({ file, width }: { file: LibraryFile; width: number }) {
  const query = useQuery(
    (client) => client["library.getFileContentUrl"]({ fileId: file.id }),
    `collection-content-${file.id}`,
  );
  const [contentError, setContentError] = useState<string>();
  return (
    <View style={{ width, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 }}>
        <FileIcon type={fileIconType(file)} {...(file.sourceUrl ? { url: file.sourceUrl } : {})} />
        <Text numberOfLines={2} style={{ flex: 1, color: "#EDEDED", fontSize: 14 }}>
          {file.title}
        </Text>
      </View>
      <View style={{ height: 350, backgroundColor: "#0B0B0B" }}>
        {contentError ? (
          <ErrorState
            message={contentError}
            onRetry={() => {
              setContentError(undefined);
              void query.refetch();
            }}
          />
        ) : query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <SkeletonRow />
        ) : file.kind === "image" ? (
          <Image
            source={{ uri: query.data.url }}
            style={{ flex: 1 }}
            contentFit="contain"
            accessibilityLabel={file.title}
          />
        ) : file.kind === "video" || file.kind === "audio" ? (
          <MediaSource url={query.data.url} />
        ) : file.kind === "pdf" ? (
          // Android WebViews can't render raw PDF bytes; use the same PDF.js preview as citations.
          <PdfSource
            target={{ sourceId: file.id }}
            contentUrl={query.data.url}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <SourceDocument url={query.data.url} title={file.title} onError={setContentError} />
        )}
      </View>
    </View>
  );
}
/** A feature-local comparison surface: all selected originals, horizontally scrollable. */
export function SourceCollection({ files }: { files: readonly LibraryFile[] }) {
  const { width } = useWindowDimensions();
  const [scrolled, setScrolled] = useState(false);
  return (
    <View style={{ height: 440, paddingHorizontal: 20, gap: 12 }}>
      <ScrollFade top={scrolled} color="#131313">
        <ScrollView
          horizontal
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.x > 0)}
          contentContainerStyle={{ gap: 16 }}
          showsHorizontalScrollIndicator
        >
          {files.map((file) => (
            <SourcePane key={file.id} file={file} width={Math.max(260, width - 64)} />
          ))}
        </ScrollView>
      </ScrollFade>
    </View>
  );
}
