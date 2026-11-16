import { FeatureErrorState as ErrorState } from "../notebook/FeatureUi";
import { useState } from "react";
import { FlatList, View } from "react-native";
import type { FileId, LibraryFile } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import {
  Button,
  EmptyState,
  FileIcon,
  Icon,
  Pressable,
  Screen,
  ScrollFade,
  SelectionDock,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { coverColors } from "../notebook/CoverPicker";
import { FeatureOverlay } from "../notebook/FeatureOverlay";
import { relativeTime } from "../notebook/data";
import { fileIconType, sourceHost, useLibraryFiles, useNotebooks, useSourceActions } from "./data";
import { SourceCollection } from "./SourceCollection";

type LibraryTab = "notebooks" | "notes" | "sources";
function SourceRow({
  file,
  selected,
  selecting,
  onSelect,
  onOpen,
}: {
  file: LibraryFile;
  selected: boolean;
  selecting: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={selecting ? "checkbox" : "button"}
      accessibilityLabel={`${selecting ? "Select" : "Open"} ${file.title}`}
      accessibilityState={{ checked: selected }}
      onLongPress={onSelect}
      onPress={selecting ? onSelect : onOpen}
      style={{
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 20,
        backgroundColor: selected ? "#161616" : "transparent",
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? "#ABC4FF" : "transparent",
          borderWidth: selected ? 0 : 1.5,
          borderColor: "#2E2E2E",
        }}
      >
        {selected ? <Icon name="check" size={13} strokeWidth={2} color="#0B1020" /> : null}
      </View>
      <View
        style={{
          width: 32,
          height: 32,
          borderWidth: 1,
          borderColor: "#222222",
          borderRadius: 8,
          backgroundColor: "#161616",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FileIcon type={fileIconType(file)} {...(file.sourceUrl ? { url: file.sourceUrl } : {})} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: "500" }}>
          {file.title}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {sourceHost(file)}
        </Text>
      </View>
      {!selected ? <Text variant="meta">{relativeTime(file.createdAt)}</Text> : null}
    </Pressable>
  );
}

export function SourcesSelectScreen({ route, navigation }: ScreenProps<"SourcesSelect">) {
  const library = useLibraryFiles();
  const notebooks = useNotebooks();
  const actions = useSourceActions();
  const [requestedIds, setSelectedIds] = useState<Set<FileId>>(
    () => new Set(route.params?.selectedIds),
  );
  const [tab, setTab] = useState<LibraryTab>("sources");
  const [deleting, setDeleting] = useState(false);
  const [together, setTogether] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [now] = useState(Date.now);
  const sources = library.files
    ?.filter((file) => file.kind !== "note")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = library.files?.filter((file) => file.kind === "note");
  const allowed = sources ? new Set(sources.map((file) => file.id)) : undefined;
  const selectedIds = new Set([...requestedIds].filter((id) => !allowed || allowed.has(id)));
  const selected = sources?.filter((file) => selectedIds.has(file.id)) ?? [];
  const ids = [...selectedIds];
  function toggle(id: FileId) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function ask() {
    const question = `Help me understand ${selected.length === 1 ? "this source" : "these sources"}: ${selected.map((file) => file.title).join("; ")}`;
    const thread = await actions.ask(question, ids);
    if (thread) navigation.push("Chat", { threadId: thread.id, q: question });
  }
  const recent =
    sources?.filter((file) => now - new Date(file.createdAt).getTime() < 86_400_000) ?? [];
  const earlier = sources?.filter((file) => !recent.includes(file)) ?? [];
  const grouped: Array<
    | { type: "heading"; label: string; id: string }
    | { type: "source"; file: LibraryFile; id: string }
  > = [];
  for (const [title, files] of [
    ["Just captured", recent],
    ["Earlier", earlier],
  ] as const) {
    if (files.length)
      grouped.push(
        { type: "heading", label: `${title} · ${files.length}`, id: title },
        ...files.map((file) => ({ type: "source" as const, file, id: file.id })),
      );
  }
  return (
    <Screen edges={["top", "left", "right"]}>
      <View
        style={{
          height: 52,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Button
          accessibilityLabel={ids.length ? "Clear selection" : "Back"}
          variant="ghost"
          style={{ height: 44 }}
          onPress={() => (ids.length ? setSelectedIds(new Set()) : navigation.goBack())}
        >
          <Text style={{ fontSize: 16, color: "#EDEDED" }}>{ids.length ? "Cancel" : "Back"}</Text>
        </Button>
        <Text
          style={{ fontSize: 16, fontWeight: "600", color: "#EDEDED" }}
          accessibilityLiveRegion="polite"
        >
          {ids.length} selected
        </Text>
        <Button
          accessibilityLabel="Select all sources"
          disabled={!sources?.length}
          variant="ghost"
          style={{ height: 44 }}
          onPress={() => {
            setTab("sources");
            setSelectedIds(new Set(sources?.map((file) => file.id)));
          }}
        >
          <Text style={{ fontSize: 16, color: "#EDEDED" }}>Select all</Text>
        </Button>
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 22,
          paddingHorizontal: 20,
          paddingTop: 4,
          borderBottomWidth: 1,
          borderBottomColor: "#222222",
        }}
      >
        {(
          [
            ["notebooks", "Notebooks", notebooks.folders?.length],
            ["notes", "Notes", notes?.length],
            ["sources", "Sources", sources?.length],
          ] as const
        ).map(([value, label, count]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "flex-end",
              paddingBottom: 10,
              gap: 6,
              borderBottomWidth: tab === value ? 1.5 : 0,
              borderBottomColor: "#EDEDED",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                lineHeight: 20,
                fontWeight: tab === value ? "600" : "400",
                color: tab === value ? "#EDEDED" : "#A3A3A3",
              }}
            >
              {label}
            </Text>
            <Text variant="meta" style={{ fontSize: 13, lineHeight: 20 }}>
              {count ?? ""}
            </Text>
          </Pressable>
        ))}
      </View>
      {actions.error ? (
        <View style={{ padding: 20 }}>
          <ErrorState message={errorMessage(actions.error)} />
        </View>
      ) : null}
      {library.error || notebooks.error ? (
        <View style={{ padding: 20 }}>
          <ErrorState
            message={errorMessage(library.error ?? notebooks.error)}
            onRetry={() => {
              void library.refetch();
              void notebooks.refetch();
            }}
          />
        </View>
      ) : null}
      <ScrollFade top={scrolled}>
        {tab === "sources" ? (
          <FlatList
            data={grouped}
            keyExtractor={(item) => item.id}
            onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: 130 }}
            renderItem={({ item }) =>
              item.type === "heading" ? (
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 18,
                    color: "#6E6E6E",
                    paddingHorizontal: 20,
                    paddingTop: 14,
                    paddingBottom: 4,
                  }}
                >
                  {item.label}
                </Text>
              ) : (
                <SourceRow
                  file={item.file}
                  selected={selectedIds.has(item.file.id)}
                  selecting={ids.length > 0}
                  onSelect={() => toggle(item.file.id)}
                  onOpen={() => navigation.navigate("Citation", { sourceId: item.file.id })}
                />
              )
            }
            ListEmptyComponent={
              library.loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : !library.error ? (
                <EmptyState
                  title="No sources yet"
                  description="Sources captured on your computer appear here."
                />
              ) : null
            }
          />
        ) : tab === "notes" ? (
          <FlatList
            data={notes}
            keyExtractor={(file) => file.id}
            contentContainerStyle={{ paddingBottom: 130 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open note ${item.title}`}
                onPress={() => navigation.push("Note", { fileId: item.id })}
                style={{ minHeight: 56, padding: 20 }}
              >
                <Text variant="rowTitle">{item.title}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              library.loading ? <SkeletonRow /> : <EmptyState title="No notes yet" />
            }
          />
        ) : (
          <FlatList
            data={notebooks.folders}
            keyExtractor={(folder) => folder.id}
            contentContainerStyle={{ paddingBottom: 130 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open notebook ${item.name}`}
                onPress={() => navigation.push("Notebook", { folderId: item.id })}
                style={{
                  minHeight: 56,
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 13,
                    backgroundColor: coverColors[item.color],
                    borderRadius: 2,
                  }}
                />
                <Text variant="rowTitle">{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              notebooks.loading ? <SkeletonRow /> : <EmptyState title="No notebooks yet" />
            }
          />
        )}
      </ScrollFade>
      {ids.length > 0 ? (
        <SelectionDock
          count={ids.length}
          actions={[
            {
              icon: "move",
              accessibilityLabel: "Move selected sources",
              disabled: actions.busy,
              onPress: () => navigation.navigate("Move", { fileIds: ids }),
            },
            {
              icon: "moon",
              accessibilityLabel: "Ask Ava about selected sources",
              color: "#ABC4FF",
              disabled: actions.busy,
              onPress: () => void ask(),
            },
            {
              icon: "split",
              accessibilityLabel: "Open selected sources together",
              onPress: () => setTogether(true),
            },
            {
              icon: "download",
              accessibilityLabel: "Download selected sources",
              disabled: actions.busy,
              onPress: () => void actions.download(ids),
            },
            {
              icon: "trash",
              accessibilityLabel: "Delete selected sources",
              color: "#FF6B6B",
              disabled: actions.busy,
              onPress: () => setDeleting(true),
            },
          ]}
        />
      ) : null}
      <FeatureOverlay
        visible={deleting}
        title={`Delete ${ids.length} sources?`}
        onClose={() => setDeleting(false)}
      >
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Text>These sources move to Trash. You can restore them for 30 days.</Text>
          <Button
            accessibilityLabel="Confirm move selected sources to Trash"
            variant="destructive"
            busy={actions.busy}
            style={{ height: 44 }}
            onPress={() => {
              void actions.trash(ids).then((ok) => {
                if (ok) {
                  setSelectedIds(new Set());
                  setDeleting(false);
                }
              });
            }}
          >
            Move to Trash
          </Button>
          {actions.error ? <ErrorState message={errorMessage(actions.error)} /> : null}
        </View>
      </FeatureOverlay>
      <FeatureOverlay
        visible={together}
        title={`${selected.length} sources`}
        onClose={() => setTogether(false)}
      >
        <SourceCollection files={selected} />
      </FeatureOverlay>
    </Screen>
  );
}
