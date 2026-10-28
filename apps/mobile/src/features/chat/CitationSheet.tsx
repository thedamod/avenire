import { SheetError as ErrorState } from "./outputs/SheetError";
import { useEffect, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { ThreadId } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import { apiUrl } from "../../state/auth";
import { colors } from "../../theme/tokens";
import {
  Aside,
  Button,
  EmptyState,
  FileIcon,
  IconButton,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { originLabel, phoneReopen, savedOn } from "../sources/reopen";
import { useCitationSource } from "./citations/data";
import { citationFocus, object, string, timestamp, youtubeId } from "./citations/model";
import {
  CitedLabel,
  ImageSource,
  PdfLoadingFrame,
  PdfSource,
  VideoSource,
  YouTubeSource,
} from "./citations/SourceViews";

export function CitationSheet({ route, navigation }: ScreenProps<"Citation">) {
  const target = route.params;
  const underlying = [...navigation.getState().routes]
    .reverse()
    .find((item) => item.name === "Chat" || item.name === "Output");
  const threadId = string(object(underlying?.params).threadId) as ThreadId | undefined;
  const source = useCitationSource(target.sourceId, threadId);
  const focus =
    citationFocus(target) ??
    [...(source.data?.citations.values() ?? [])].find(
      (citation) =>
        citation.sourceId === target.sourceId &&
        (target.page === undefined || citation.page === target.page) &&
        (target.time === undefined || citation.time === target.time),
    );
  const [openError, setOpenError] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    navigation.setOptions({
      animation: reduced ? "none" : "slide_from_bottom",
      animationDuration: 250,
    });
  }, [navigation, reduced]);
  const data = source.data;
  const file = data?.file;
  const url = data?.content?.url;
  // This sheet is Avenire's own viewer: when the original only lives on a computer, the stored
  // bytes are the way out.
  const plan = file ? phoneReopen(file) : undefined;
  const original = plan?._tag === "OpenUrl" ? plan.url : url;
  const youtube = youtubeId(file?.sourceUrl ?? null);
  const time =
    typeof target.time === "number" && Number.isFinite(target.time)
      ? Math.max(0, target.time)
      : (file?.mediaPositionSec ?? 0);
  const location =
    file?.kind === "pdf"
      ? `Page ${Math.max(1, target.page ?? 1)}`
      : file?.kind === "video" || file?.kind === "audio" || youtube
        ? timestamp(time)
        : target.region
          ? "Cited region"
          : ((file && originLabel(file)) ?? "Source");
  const meta = [location, file ? savedOn(file) : null].filter(Boolean).join(" · ");
  const openOriginal = () => {
    if (!original) return;
    try {
      const resolved = new URL(original, apiUrl);
      if (!["https:", "http:"].includes(resolved.protocol)) {
        setOpenError(true);
        return;
      }
      void Linking.openURL(resolved.toString())
        .then(() => setOpenError(false))
        .catch(() => setOpenError(true));
    } catch {
      setOpenError(true);
    }
  };
  let body;
  // Page citations are PDFs: hold the viewer's frame (and its cited label) at full body height.
  if (source.loading)
    body = target.page ? (
      <>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <CitedLabel>Cited in Ruth's answer</CitedLabel>
        </View>
        <PdfLoadingFrame />
      </>
    ) : (
      <View style={{ flex: 1 }}>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  else if (source.error)
    body = (
      <View style={{ padding: 20 }}>
        <ErrorState message={errorMessage(source.error)} onRetry={() => void source.refetch()} />
      </View>
    );
  else if (!file || !data)
    body = (
      <EmptyState
        title="Source unavailable"
        description="This source is no longer available."
        icon="doc"
      />
    );
  else if (file.kind === "pdf")
    body = (
      <>
        {target.page ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <CitedLabel>Cited in Ruth's answer</CitedLabel>
          </View>
        ) : null}
        <PdfSource
          key={`${target.sourceId}:${target.page ?? 1}`}
          target={target}
          passage={focus?.passage}
          contentUrl={url}
          onRetry={() => void source.refetch()}
        />
      </>
    );
  else
    body = (
      <ScrollFade top={scrolled} color={colors.sheet}>
        <ScrollView
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 4)}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        >
          {url && (file.kind === "video" || file.kind === "audio") ? (
            <VideoSource key={url} url={new URL(url, apiUrl).toString()} time={time} />
          ) : youtube ? (
            <YouTubeSource key={`${youtube}:${time}`} id={youtube} time={time} />
          ) : file.kind === "image" && url ? (
            <ImageSource
              key={target.sourceId}
              url={url}
              title={file.title}
              region={target.region}
            />
          ) : (
            <EmptyState
              title={file.title}
              description={file.preview ?? "Open the original to read this source."}
              icon="doc"
            />
          )}
          {file.kind === "video" || file.kind === "audio" || youtube ? (
            <>
              <View style={{ gap: 8, paddingHorizontal: 4 }}>
                <CitedLabel>{`Cited · ${timestamp(time)}`}</CitedLabel>
                {file.mediaPositionSec !== null ? (
                  <Text variant="meta">Captured at {timestamp(file.mediaPositionSec)}</Text>
                ) : null}
              </View>
              {focus?.passage ? (
                <Aside color={colors.accent}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <Text variant="mono" color="accent-text" style={{ paddingTop: 2 }}>
                      {timestamp(time)}
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        fontSize: 14,
                        lineHeight: 20,
                        fontWeight: "500",
                        color: colors.fg,
                      }}
                    >
                      {focus.passage}
                    </Text>
                  </View>
                </Aside>
              ) : file.preview ? (
                <Aside>
                  <Text variant="meta">About this source</Text>
                  <Text>{file.preview}</Text>
                </Aside>
              ) : null}
            </>
          ) : null}
          {file.kind === "image" ? (
            <>
              {target.region ? <CitedLabel>Cited region</CitedLabel> : null}
              {file.preview ? (
                <Aside gap={4}>
                  <Text variant="meta">Read from the image</Text>
                  <Text
                    style={{ fontSize: 14, lineHeight: 20, color: colors.fg, fontWeight: "500" }}
                  >
                    {file.preview}
                  </Text>
                </Aside>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </ScrollFade>
    );
  return (
    <Screen edges={["left", "right", "bottom"]} style={{ backgroundColor: colors.sheet }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingLeft: 20,
          paddingRight: 8,
          paddingTop: 6,
          paddingBottom: 10,
          minHeight: 62,
        }}
      >
        {file ? (
          <FileIcon
            type={file.kind === "web-page" ? "web" : file.kind}
            {...(file.sourceUrl ? { url: file.sourceUrl } : {})}
            size={16}
          />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {file?.title ?? "Citation"}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {original ? (
          <Button
            variant="link"
            accessibilityLabel={`Open original: ${file?.title ?? "source"}`}
            hitSlop={6}
            onPress={openOriginal}
          >
            Open original
          </Button>
        ) : null}
        <IconButton
          icon="close"
          accessibilityLabel="Close citation"
          onPress={() => navigation.goBack()}
        />
      </View>
      {openError ? (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <ErrorState message="The original couldn't be opened." onRetry={openOriginal} />
        </View>
      ) : null}
      {body}
    </Screen>
  );
}
