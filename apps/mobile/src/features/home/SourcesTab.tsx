import { Fragment, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";
import type { FileId, Folder, LibraryFile } from "@avenire/contracts";
import {
  Button,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  FileIcon,
  Icon,
  Pressable,
  Text,
  errorMessage,
  type IconName,
} from "../../ui";
import {
  coverColors,
  relativeTime,
  sourceState,
  timestamp,
  useSourceJobs,
  type SourceState,
} from "./data";

type Filter = "all" | "unfiled" | "pdf" | "video" | "web" | "image";
const filters: {
  value: Filter;
  label: string;
  icon?: IconName;
  kinds?: readonly LibraryFile["kind"][];
}[] = [
  { value: "all", label: "All" },
  { value: "unfiled", label: "Unfiled" },
  {
    value: "pdf",
    label: "PDFs and documents",
    icon: "doc",
    kinds: ["pdf", "document"],
  },
  {
    value: "video",
    label: "Video and audio",
    icon: "video",
    kinds: ["video", "audio"],
  },
  {
    value: "web",
    label: "Web pages",
    icon: "globe",
    kinds: ["web-page", "selection"],
  },
  { value: "image", label: "Images", icon: "image", kinds: ["image"] },
];

export function SourceIcon({
  file,
  framed = false,
  size = 16,
}: {
  file: Pick<LibraryFile, "kind" | "sourceUrl">;
  framed?: boolean;
  size?: number;
}) {
  const web = file.kind === "web-page" || file.kind === "selection";
  const youtube =
    file.kind === "video" &&
    /(?:youtube\.com|youtu\.be)/i.test(file.sourceUrl ?? "");
  return (
    <View style={framed ? styles.fileFrame : undefined}>
      {youtube ? (
        <View
          style={{
            width: size,
            height: size * 0.72,
            borderRadius: 3,
            backgroundColor: "#FF3B30",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="play" size={size * 0.55} color="#FFFFFF" />
        </View>
      ) : (
        <FileIcon
          type={web ? "web" : file.kind}
          {...(file.sourceUrl ? { url: file.sourceUrl } : {})}
          size={size}
        />
      )}
    </View>
  );
}

export function SourcesTab({
  sources,
  folderById,
  onOpen,
  onSelect,
  onRemove,
  onMove,
}: {
  sources: readonly LibraryFile[];
  folderById: ReadonlyMap<Folder["id"], Folder>;
  onOpen: (file: LibraryFile) => void;
  onSelect: (fileId: FileId) => void;
  onRemove: (fileId: FileId) => Promise<void>;
  onMove: (fileId: FileId) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [kept, setKept] = useState<ReadonlySet<FileId>>(() => new Set());
  const [actionError, setActionError] = useState<unknown>();
  const [busy, setBusy] = useState<FileId>();
  const ingestion = useSourceJobs(sources);
  const visible = sources.filter(
    (file) =>
      filter === "all" ||
      (filter === "unfiled"
        ? file.placement === "inbox"
        : filters
            .find((item) => item.value === filter)
            ?.kinds?.includes(file.kind)),
  );
  const processing: { file: LibraryFile; state: SourceState }[] = [];
  const needsYou: { file: LibraryFile; state: SourceState }[] = [];
  const rest: LibraryFile[] = [];
  for (const file of visible) {
    const state = sourceState(ingestion.jobs.get(file.id));
    if (state?.kind === "processing") processing.push({ file, state });
    else if (state && !(state.kind === "paywall" && kept.has(file.id)))
      needsYou.push({ file, state });
    else rest.push(file);
  }
  const captured =
    filter === "unfiled"
      ? rest.filter(
          (file) => Date.now() - Date.parse(file.createdAt) < 10_800_000,
        )
      : [];
  const earlier = rest.filter((file) => !captured.includes(file));
  const run = async (fileId: FileId, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(fileId);
    setActionError(undefined);
    try {
      await action();
    } catch (cause) {
      setActionError(cause);
    } finally {
      setBusy(undefined);
    }
  };
  const row = (file: LibraryFile, state: SourceState | null = null) => {
    const folder = file.folderIds[0]
      ? folderById.get(file.folderIds[0])
      : undefined;
    const processingState = state?.kind === "processing";
    const needsAction = state && !processingState;
    const openUrl = () =>
      file.sourceUrl
        ? Linking.openURL(file.sourceUrl)
        : ingestion.retry(file.id);
    const primary =
      state?.kind === "password"
        ? "Enter password"
        : state?.kind === "paywall"
          ? "Open in browser"
          : state?.kind === "login"
            ? "Remind me there"
            : state?.kind === "paused"
              ? "Resume"
              : "Try again";
    const fix = () => {
      if (state?.kind === "password")
        Alert.alert(
          "Open it on your computer",
          "Unlock the PDF on your computer, then capture it again. Password entry isn't available on your phone yet.",
        );
      else if (state?.kind === "login")
        Alert.alert(
          "Capture it on your computer",
          "Open this page in Avenire on your computer with logged-in capture on. Desktop reminders aren't available yet.",
        );
      else
        void run(
          file.id,
          state?.kind === "paywall" ? openUrl : () => ingestion.retry(file.id),
        );
    };
    let host: string | undefined;
    try {
      host = file.sourceUrl
        ? new URL(file.sourceUrl).hostname.replace(/^www\./, "")
        : undefined;
    } catch {
      /* The type icon is the fallback. */
    }
    const subtitle = [
      host ??
        (file.kind === "image"
          ? "Photo"
          : file.source === "capture"
            ? "Captured on your computer"
            : "Synced from your computer"),
      file.mediaPositionSec !== null
        ? `saved at ${timestamp(file.mediaPositionSec)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <View key={file.id}>
        <View
          style={[
            styles.sourceRow,
            { alignItems: needsAction ? "flex-start" : "center" },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${file.title}`}
            accessibilityHint="Long press to select sources"
            hitSlop={6}
            onPress={() => onOpen(file)}
            onLongPress={() => onSelect(file.id)}
            style={{ width: 32, height: 32 }}
          >
            <SourceIcon file={file} framed />
          </Pressable>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              gap: processingState ? 6 : needsAction ? 3 : 2,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${file.title}`}
              accessibilityHint="Long press to select sources"
              onPress={() => onOpen(file)}
              onLongPress={() => onSelect(file.id)}
              style={{ minHeight: 44, justifyContent: "center", gap: 2 }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  lineHeight: 20,
                  color: "#EDEDED",
                  fontWeight: "500",
                }}
              >
                {file.title}
              </Text>
              {needsAction ? (
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 18,
                    color:
                      state.kind === "password" || state.kind === "failed"
                        ? "#FF6B6B"
                        : "#F2C46D",
                  }}
                >
                  {state.reason}
                </Text>
              ) : !processingState ? (
                <Text variant="meta" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </Pressable>
            {processingState ? (
              <>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={`Processing ${file.title}`}
                  style={{
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: "#2E2E2E",
                  }}
                />
                <Text variant="meta">{state.label}</Text>
              </>
            ) : null}
            {!state ? (
              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  paddingTop: 4,
                }}
              >
                {folder ? (
                  <>
                    <View
                      style={{
                        width: 7,
                        height: 9,
                        borderRadius: 1,
                        backgroundColor: coverColors[folder.color],
                      }}
                    />
                    <Text variant="meta" color="fg-2" numberOfLines={1}>
                      {folder.name}
                    </Text>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`File ${file.title} to a notebook`}
                    hitSlop={8}
                    onPress={() => onMove(file.id)}
                  >
                    <Text variant="meta" color="fg-2">
                      File to notebook…
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null}
            {needsAction ? (
              <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
                <Button
                  variant="secondary"
                  accessibilityLabel={`${primary}: ${file.title}`}
                  hitSlop={{ top: 6, bottom: 6 }}
                  onPress={fix}
                  disabled={busy !== undefined}
                  busy={busy === file.id}
                >
                  {primary}
                </Button>
                <Button
                  variant="ghost"
                  accessibilityLabel={`${state.kind === "paywall" ? "Keep" : "Remove"} ${file.title}`}
                  hitSlop={{ top: 6, bottom: 6 }}
                  disabled={busy !== undefined}
                  onPress={() =>
                    state.kind === "paywall"
                      ? setKept((before) => new Set(before).add(file.id))
                      : void run(file.id, () => onRemove(file.id))
                  }
                >
                  {state.kind === "paywall" ? "Keep" : "Remove"}
                </Button>
              </View>
            ) : null}
          </View>
          {!state ? (
            <Text variant="meta" style={{ maxWidth: 62 }}>
              {relativeTime(file.createdAt)}
            </Text>
          ) : null}
        </View>
        <Divider inset={64} />
      </View>
    );
  };
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 4,
        }}
      >
        {filters.map((item) =>
          item.icon ? (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: filter === item.value }}
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => setFilter(item.value)}
              style={{
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#2E2E2E",
                backgroundColor:
                  filter === item.value ? "#242424" : "transparent",
                justifyContent: "center",
              }}
            >
              <Icon name={item.icon} size={14} />
            </Pressable>
          ) : (
            <Chip
              key={item.value}
              size={32}
              label={item.label}
              accessibilityLabel={item.label}
              hitSlop={{ top: 6, bottom: 6 }}
              active={filter === item.value}
              onPress={() => setFilter(item.value)}
              {...(item.value === "unfiled"
                ? {
                    count: sources.filter((file) => file.placement === "inbox")
                      .length,
                  }
                : {})}
            />
          ),
        )}
      </ScrollView>
      {ingestion.error ? (
        <View style={styles.error}>
          <ErrorState
            message={`Source status couldn't update. ${errorMessage(ingestion.error)}`}
            onRetry={ingestion.reconnect}
          />
        </View>
      ) : null}
      {actionError ? (
        <View style={styles.error}>
          <ErrorState message={errorMessage(actionError)} />
        </View>
      ) : null}
      {processing.length ? (
        <>
          <GroupLabel text={`Processing · ${processing.length}`} />
          {processing.map(({ file, state }) => row(file, state))}
        </>
      ) : null}
      {needsYou.length ? (
        <>
          <GroupLabel text={`Needs you · ${needsYou.length}`} />
          {needsYou.map(({ file, state }) => row(file, state))}
        </>
      ) : null}
      {captured.length ? (
        <>
          <GroupLabel
            text={`Just captured on your computer · ${captured.length}`}
          />
          {captured.map((file) => row(file))}
        </>
      ) : null}
      {earlier.length ? (
        <Fragment>
          {filter === "unfiled" ? (
            <GroupLabel text={`Earlier · ${earlier.length}`} />
          ) : null}
          {earlier.map((file) => row(file))}
        </Fragment>
      ) : null}
      {!visible.length ? (
        <EmptyState
          title={
            filter === "unfiled" ? "Nothing unfiled." : "No sources here yet."
          }
          description={
            filter === "unfiled"
              ? "Everything has a notebook."
              : "Capture a PDF, video or page on your computer. It will sync here."
          }
        />
      ) : null}
    </View>
  );
}
function GroupLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 2,
        fontSize: 13,
        lineHeight: 18,
        color: "#6E6E6E",
      }}
    >
      {text}
    </Text>
  );
}
const styles = StyleSheet.create({
  fileFrame: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#222222",
    backgroundColor: "#161616",
    alignItems: "center",
    justifyContent: "center",
  },
  sourceRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  error: { marginHorizontal: 20, marginTop: 14 },
});
