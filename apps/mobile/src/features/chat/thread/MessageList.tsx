import type { RuthUIMessage } from "@avenire/ai/message-types";
import type { CloudRun } from "@avenire/contracts";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { colors } from "../../../theme/tokens";
import {
  EmptyState,
  ErrorState,
  Icon,
  Markdown,
  Pressable,
  ScrollFade,
  Skeleton,
  SkeletonRow,
  Text,
} from "../../../ui";
import { AssistantMessage } from "./AssistantMessage";
import { collectCitations, type Citation, type CitationMap } from "./citations";
import { FigureFrame } from "./FigureFrame";
import { OutputButtons } from "./OutputButtons";
import type { OutputItem } from "./report";
import { deriveRows } from "./rows";
import type { ChatRow, MediaItem, TurnTiming } from "./types";
import { UserBubble } from "./UserBubble";
import { VideoTile } from "./VideoTile";
import { WidgetView } from "./WidgetView";
import { WorkHeader } from "./WorkHeader";
import { WorkActivity } from "./WorkLogRow";
import { assetUrl } from "./widgetProtocol";
import { useAssetSource } from "../../../lib/useAssetSource";

export interface ReportPresentation {
  run: CloudRun;
  messages: readonly RuthUIMessage[];
  outputs: readonly OutputItem[];
  loading: boolean;
  error?: string | undefined;
  retry: () => void;
}

export function MessageList({
  messages,
  status,
  loading,
  error,
  onRetry,
  onCitation,
  onOutput,
  timings,
  startedAt,
  report,
  scrollVersion = 0,
  bottomInset = 0,
}: {
  messages: readonly RuthUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  loading: boolean;
  error?: string | undefined;
  onRetry: () => void;
  onCitation: (citation: Citation) => void;
  onOutput: (output: OutputItem) => void;
  timings: ReadonlyMap<string, TurnTiming>;
  startedAt: number | null;
  report?: ReportPresentation | undefined;
  scrollVersion?: number;
  /** Height of anything floating over the bottom of the list, so the last row can scroll clear of it. */
  bottomInset?: number;
}) {
  const scroll = useRef<ScrollView>(null);
  const follows = useRef(true);
  const jumping = useRef(false);
  const frame = useRef<number | undefined>(undefined);
  const [scrolled, setScrolled] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const metrics = useRef({ height: 0, content: 0, offset: 0 });
  const updateScrollState = useCallback(() => {
    const { height, content, offset } = metrics.current;
    setAwayFromBottom(!follows.current && content - height - offset > 80);
  }, []);
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [reportExpanded, setReportExpanded] = useState(true);
  const citations = useMemo(
    () => collectCitations([...(report?.messages ?? []), ...messages]),
    [messages, report?.messages],
  );
  const rows = useMemo(
    () =>
      deriveRows({
        messages,
        status,
        workExpanded: expanded,
        timings,
        turnStartedAt: startedAt,
        error: null,
      }),
    [messages, status, expanded, timings, startedAt],
  );
  const follow = useCallback(() => {
    if (!follows.current || frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      setAwayFromBottom(false);
      scroll.current?.scrollToEnd({ animated: false });
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    follows.current = true;
    follow();
  }, [scrollVersion, follow]);
  const reportId = report?.run.id;
  useEffect(() => {
    if (reportId && messages.length === 0) {
      follows.current = false;
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current);
        frame.current = undefined;
      }
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [reportId, messages.length]);
  const toggle = useCallback(
    (id: string, value: boolean) => setExpanded((current) => new Map(current).set(id, value)),
    [],
  );
  return (
    <ScrollFade top={scrolled} bottom={awayFromBottom} size={24}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={32}
        onContentSizeChange={(_width, height) => {
          metrics.current.content = height;
          updateScrollState();
          follow();
        }}
        onLayout={({ nativeEvent: e }) => {
          metrics.current.height = e.layout.height;
          updateScrollState();
          follow();
        }}
        onScrollBeginDrag={() => {
          jumping.current = false;
          if (frame.current !== undefined) {
            cancelAnimationFrame(frame.current);
            frame.current = undefined;
          }
          follows.current = false;
        }}
        onScroll={({ nativeEvent: e }) => {
          const scrolledUp = e.contentOffset.y < metrics.current.offset - 2;
          metrics.current = {
            height: e.layoutMeasurement.height,
            content: e.contentSize.height,
            offset: e.contentOffset.y,
          };
          setScrolled(e.contentOffset.y > 4);
          const nearBottom =
            e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y <= 80;
          if (nearBottom) jumping.current = false;
          // A content/layout change can emit a scroll event before follow() catches
          // up. Only an upward scroll or a drag opts out of following the stream.
          follows.current = jumping.current || nearBottom || (follows.current && !scrolledUp);
          updateScrollState();
        }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: report ? 6 : 8,
          paddingBottom: 24 + bottomInset,
          paddingHorizontal: 20,
          gap: 14,
        }}
      >
        {loading ? (
          <View accessibilityLabel="Loading conversation">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}
        {report ? (
          <ReportBody
            report={report}
            expanded={reportExpanded}
            onToggle={() => setReportExpanded(!reportExpanded)}
            citations={citations}
            onCitation={onCitation}
            onOutput={onOutput}
            onResize={follow}
          />
        ) : null}
        {!loading && !report && !rows.length && !error ? (
          <EmptyState
            title="Ask Ruth"
            description="Ask a question about your sources or notes."
            icon="moon"
          />
        ) : null}
        {rows.map((row) => (
          <ThreadRow
            key={row.id}
            row={row}
            citations={citations}
            onCitation={onCitation}
            onToggle={toggle}
            onResize={follow}
          />
        ))}
        {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
      </ScrollView>
      {awayFromBottom ? (
        <Animated.View
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
          style={{ position: "absolute", alignSelf: "center", bottom: 12 + bottomInset }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to latest message"
            onPress={() => {
              jumping.current = true;
              follows.current = true;
              setAwayFromBottom(false);
              scroll.current?.scrollToEnd({ animated: true });
            }}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 18,
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Icon name="chevD" size={16} />
          </Pressable>
        </Animated.View>
      ) : null}
    </ScrollFade>
  );
}

function ReportBody({
  report,
  expanded,
  onToggle,
  citations,
  onCitation,
  onOutput,
  onResize,
}: {
  report: ReportPresentation;
  expanded: boolean;
  onToggle: () => void;
  citations: CitationMap;
  onCitation: (citation: Citation) => void;
  onOutput: (output: OutputItem) => void;
  onResize: () => void;
}) {
  const active = ["running", "scheduled", "provisioning"].includes(report.run.status);
  const rows = useMemo(
    () =>
      deriveRows({
        messages: report.messages,
        status: active ? "streaming" : "ready",
        workExpanded: new Map(),
        timings: new Map(),
        turnStartedAt: null,
        error: null,
      }),
    [report.messages, active],
  );
  const mediaUrls = new Set(
    rows
      .filter((row) => row.kind === "media")
      .flatMap((row) => row.items)
      .flatMap((item) => ("url" in item ? [item.url] : [])),
  );
  const assets: MediaItem[] = report.run.assets
    .filter((asset) => !mediaUrls.has(asset.url))
    .flatMap((asset, index): MediaItem[] =>
      asset.kind === "widget"
        ? [
            {
              kind: "widget",
              id: asset.id,
              title: asset.title,
              url: asset.url,
              figure: mediaUrls.size + index + 1,
            },
          ]
        : asset.kind === "image" || asset.kind === "video"
          ? [
              {
                kind: asset.kind,
                id: asset.id,
                title: asset.title,
                url: asset.url,
                figure: mediaUrls.size + index + 1,
                durationSec: null,
              },
            ]
          : [],
    );
  const prose =
    report.run.summary ??
    rows
      .filter((row) => row.kind === "prose")
      .map((row) => row.text)
      .join("\n\n");
  const startedAt = report.run.startedAt ? Date.parse(report.run.startedAt) : null;
  const finishedAt = report.run.finishedAt ? Date.parse(report.run.finishedAt) : null;
  const time = report.run.finishedAt
    ? new Date(report.run.finishedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : undefined;
  return (
    <>
      <WorkHeader
        startedAt={startedAt}
        finishedAt={finishedAt}
        active={active}
        overnight
        expanded={expanded}
        onToggle={onToggle}
        time={time}
      />
      {prose ? (
        <AssistantMessage text={prose} citations={citations} onCitation={onCitation} />
      ) : report.loading ? (
        <SkeletonRow />
      ) : null}
      <OutputButtons outputs={report.outputs} onOpen={onOutput} />
      {expanded ? (
        <WorkActivity
          entries={rows.filter((row) => row.kind === "work").flatMap((row) => row.entries)}
        />
      ) : null}
      {rows
        .filter((row) => ["media", "error", "subagent", "request", "thinking"].includes(row.kind))
        .map((row) => (
          <ThreadRow
            key={row.id}
            row={row}
            citations={citations}
            onCitation={onCitation}
            onToggle={() => {}}
            onResize={onResize}
          />
        ))}
      {assets.length ? <MediaRow items={assets} onResize={onResize} /> : null}
      {report.error ? <ErrorState message={report.error} onRetry={report.retry} /> : null}
      {report.run.status === "failed" ? (
        <ErrorState message={report.run.error ?? "The overnight run couldn't finish."} />
      ) : null}
    </>
  );
}

function ThreadRow({
  row,
  citations,
  onCitation,
  onToggle,
  onResize,
}: {
  row: ChatRow;
  citations: CitationMap;
  onCitation: (citation: Citation) => void;
  onToggle: (id: string, value: boolean) => void;
  onResize: () => void;
}) {
  switch (row.kind) {
    case "user":
      return <UserBubble text={row.text} attachments={row.attachments} />;
    case "prose":
      return <AssistantMessage text={row.text} citations={citations} onCitation={onCitation} />;
    case "work-header":
      return <WorkHeader {...row} onToggle={() => onToggle(row.messageId, !row.expanded)} />;
    case "work":
      return <WorkActivity entries={row.entries} />;
    case "reasoning":
      return <Reasoning text={row.text} />;
    case "media":
      return <MediaRow items={row.items} onResize={onResize} />;
    case "error":
      return <ErrorState message={row.text} />;
    case "request":
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon
            name={row.state === "waiting" ? "spinner" : "check"}
            size={14}
            color={row.state === "waiting" ? colors.accent : colors["fg-3"]}
          />
          <Text
            color={row.state === "waiting" ? "fg" : "fg-2"}
            style={{ flex: 1, fontSize: 14, lineHeight: 19 }}
          >
            {row.label}
          </Text>
        </View>
      );
    case "thinking":
      return (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="spinner" size={14} color={colors.accent} />
            <Text color="accent-text">Ruth is working…</Text>
          </View>
          <Skeleton width="55%" />
        </View>
      );
    case "subagent":
      return (
        <Text variant="meta" color="accent-text">
          {row.label}
          {row.progress !== null ? ` · ${Math.round(row.progress * 100)}%` : ""}
        </Text>
      );
    case "cloud-run":
      return <Text variant="meta">Overnight report</Text>;
  }
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ruth's reasoning"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text variant="meta">Thought process {open ? "⌄" : "›"}</Text>
      </Pressable>
      {open ? <Markdown value={text} size="chat" /> : null}
    </View>
  );
}

function MediaRow({ items, onResize }: { items: readonly MediaItem[]; onResize: () => void }) {
  const visual = items.filter((item) => ["widget", "image", "video"].includes(item.kind));
  const compact = visual.length === 2 && visual.some((item) => item.kind === "video");
  return (
    <View style={{ gap: 10 }}>
      {items
        .filter((item) => item.kind === "pending")
        .map((item) => (
          <View key={item.id} style={{ gap: 8 }}>
            <Text variant="meta">Building {item.title}…</Text>
            <Skeleton height={128} radius={8} />
          </View>
        ))}
      <View style={{ flexDirection: compact ? "row" : "column", gap: 10 }}>
        {visual.map((item) =>
          item.kind === "widget" ? (
            <FigureFrame key={item.id} figure={item.figure} title={item.title} compact={compact}>
              <WidgetView
                url={item.url}
                title={item.title}
                initialHeight={compact ? 96 : 240}
                onResize={onResize}
              />
            </FigureFrame>
          ) : item.kind === "video" ? (
            <VideoTile key={item.id} {...item} compact={compact} />
          ) : item.kind === "image" ? (
            <ImageTile key={item.id} item={item} compact={compact} />
          ) : null,
        )}
      </View>
      {items
        .filter((item) => item.kind === "file")
        .map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.title}`}
            onPress={() => {
              void Linking.openURL(assetUrl(item.url));
            }}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              borderWidth: 1,
              borderColor: colors["line-2"],
              borderRadius: 8,
              paddingHorizontal: 12,
            }}
          >
            <Icon name="download" size={14} />
            <Text color="fg-2" style={{ flex: 1 }}>
              {item.title}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}

function ImageTile({
  item,
  compact,
}: {
  item: Extract<MediaItem, { kind: "image" | "video" }>;
  compact: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const asset = useAssetSource(item.url, attempt);
  return (
    <FigureFrame title={item.title} figure={item.figure} compact={compact}>
      {failed || asset?.error ? (
        <ErrorState message="This image couldn't load." onRetry={() => { setFailed(false); setAttempt((value) => value + 1); }} />
      ) : asset?.source ? (
        <Image
          key={attempt}
          source={asset.source}
          accessibilityLabel={item.title}
          contentFit="contain"
          style={{ height: compact ? 96 : 220, width: "100%" }}
          onError={() => setFailed(true)}
        />
      ) : <Skeleton height={compact ? 96 : 220} />}
    </FigureFrame>
  );
}
