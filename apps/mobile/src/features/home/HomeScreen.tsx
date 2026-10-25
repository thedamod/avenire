import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import type { CloudRun, FileId, LibraryFile } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import { useApi } from "../../state/api";
import {
  Button,
  Composer,
  Divider,
  EmptyState,
  ErrorState,
  GlassHeader,
  Icon,
  IconButton,
  NewNotebookTile,
  NotebookCover,
  Pressable,
  Screen,
  ScrollFade,
  SectionHeader,
  Skeleton,
  SkeletonRow,
  Text,
  ThreadRow,
  errorMessage,
  type IconName,
} from "../../ui";
import {
  coverColors,
  coverDrawings,
  recentToastRun,
  relativeTime,
  useHomeActivity,
  useHomeLibrary,
  type HomeActivity,
} from "./data";
import { FeatureOverlay } from "./FeatureOverlay";
import { FirstRun } from "./FirstRun";
import { HomeToast } from "./HomeToast";
import { SourcesTab } from "./SourcesTab";

type Tab = "notebooks" | "notes" | "sources";
export function HomeScreen({ navigation }: ScreenProps<"Home">) {
  const api = useApi();
  const library = useHomeLibrary();
  const activity = useHomeActivity(library.folders);
  const [tab, setTab] = useState<Tab>("notebooks");
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState<unknown>();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [scrolled, setScrolled] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const refreshRef = useRef(() => {});
  refreshRef.current = () => {
    library.refetch();
    activity.refetch();
    setNow(Date.now());
  };
  const visited = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (visited.current) refreshRef.current();
      visited.current = true;
    }, []),
  );
  const firstRun =
    library.loaded &&
    library.files?.length === 0 &&
    library.folders?.length === 0;
  const toast = recentToastRun(activity.runs, now);
  const openRun = (run: CloudRun) => {
    if (run.status === "succeeded" && activity.cloudThread)
      navigation.navigate("Chat", { threadId: activity.cloudThread.id });
    else navigation.navigate("TaskDetail", { taskId: run.taskId });
  };
  const openActivity = (item: HomeActivity) =>
    item.kind === "chat"
      ? navigation.navigate("Chat", { threadId: item.thread.id })
      : openRun(item.run);
  const openFile = (file: LibraryFile) =>
    file.kind === "note"
      ? navigation.navigate("Note", { fileId: file.id })
      : navigation.navigate("Citation", {
          sourceId: file.id,
          ...(file.mediaPositionSec !== null
            ? { time: file.mediaPositionSec }
            : {}),
        });
  const newNote = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setActionError(undefined);
    try {
      const note = await call(api, (client) =>
        client["library.createNote"]({
          title: "Untitled",
          markdown: "",
          folderIds: [],
          source: "user",
        }),
      );
      invalidateLibrary(api, ["files", "folders", "notes"]);
      navigation.navigate("Note", { fileId: note.id });
    } catch (cause) {
      setActionError(cause);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const trash = async (fileId: FileId) => {
    await call(api, (client) =>
      client["library.trashFiles"]({ fileIds: [fileId] }),
    );
    invalidateLibrary(api);
  };
  const download = () =>
    Alert.alert(
      "Get Avenire for your computer",
      "Install Avenire for Mac or Windows and sign in to the same account. A computer-app download link hasn't been configured in this build yet.",
    );
  const menuItems: { label: string; icon: IconName; action: () => void }[] = [
    {
      label: "New overnight task",
      icon: "moon",
      action: () => navigation.navigate("ScheduleTask"),
    },
    {
      label: "Chats and Tasks",
      icon: "chat",
      action: () => navigation.navigate("Tasks"),
    },
    {
      label: "Ruth's clusters",
      icon: "folder",
      action: () => navigation.navigate("ClusterReview"),
    },
    {
      label: "Settings",
      icon: "gear",
      action: () => navigation.navigate("Settings"),
    },
    {
      label: "Trash",
      icon: "trash",
      action: () => navigation.navigate("Trash"),
    },
  ];
  const ask = () => navigation.navigate("Ask");
  return (
    <Screen edges={["top", "left", "right"]}>
      <GlassHeader
        title="Avenire"
        large
        trailing={[
          {
            icon: "more",
            accessibilityLabel: "Open Home menu",
            hitSlop: 2,
            onPress: () => setMenu(true),
          },
        ]}
      />
      <ScrollFade top={scrolled}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) =>
            setScrolled(event.nativeEvent.contentOffset.y > 0)
          }
          contentContainerStyle={{ paddingBottom: 130 }}
        >
          {toast ? (
            <HomeToast run={toast} onPress={() => openRun(toast)} />
          ) : null}
          <View style={{ paddingTop: 20 }}>
            {/* Local tabs retain the Paper strip and expose 44pt hit areas. */}
            <View style={styles.tabs}>
              {(
                [
                  {
                    value: "notebooks",
                    label: "Notebooks",
                    count: library.folders?.length,
                  },
                  {
                    value: "notes",
                    label: "Notes",
                    count: library.notes?.length,
                  },
                  {
                    value: "sources",
                    label: "Sources",
                    count: library.sources?.length,
                  },
                ] as const
              ).map((item) => (
                <Pressable
                  key={item.value}
                  accessibilityRole="tab"
                  accessibilityLabel={`${item.label}${item.count !== undefined ? `, ${item.count}` : ""}`}
                  accessibilityState={{ selected: tab === item.value }}
                  hitSlop={{ top: 7, bottom: 6 }}
                  onPress={() => setTab(item.value)}
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    paddingBottom: tab === item.value ? 10 : 11.5,
                    borderBottomWidth: tab === item.value ? 1.5 : 0,
                    borderBottomColor: "#EDEDED",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 20,
                      fontWeight: tab === item.value ? "600" : "400",
                      color: tab === item.value ? "#EDEDED" : "#A3A3A3",
                    }}
                  >
                    {item.label}
                  </Text>
                  {item.count !== undefined ? (
                    <Text
                      variant="meta"
                      style={{ fontSize: 13, lineHeight: 20 }}
                    >
                      {item.count}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
          {library.error ? (
            <View style={styles.error}>
              <ErrorState
                message={errorMessage(library.error)}
                onRetry={library.refetch}
              />
            </View>
          ) : null}
          {actionError ? (
            <View style={styles.error}>
              <ErrorState message={errorMessage(actionError)} />
            </View>
          ) : null}
          {tab === "notebooks" ? (
            firstRun ? (
              <FirstRun
                onNew={() => navigation.navigate("NewNotebook")}
                onDownload={() => void download()}
                onAsk={ask}
              />
            ) : (
              <View>
                {library.folders?.some((folder) => folder.suggested) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Review Ruth's suggested notebooks"
                    onPress={() => navigation.navigate("ClusterReview")}
                    style={{
                      marginHorizontal: 20,
                      marginTop: 16,
                      paddingLeft: 12,
                      borderLeftWidth: 2,
                      borderLeftColor: "#2E3B5E",
                      flexDirection: "row",
                      gap: 12,
                      minHeight: 44,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ flex: 1 }}>
                      Ruth grouped your unfiled sources into new notebooks.
                    </Text>
                    <Text variant="label" color="fg">
                      Review
                    </Text>
                  </Pressable>
                ) : null}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingTop: 16,
                    gap: 12,
                  }}
                >
                  <NewNotebookTile
                    onPress={() => navigation.navigate("NewNotebook")}
                  />
                  {library.folders === undefined && !library.error
                    ? [0, 1, 2].map((index) => (
                        <Skeleton
                          key={index}
                          width={120}
                          height={156}
                          radius={8}
                        />
                      ))
                    : library.folders?.map((folder) => (
                        <NotebookCover
                          key={folder.id}
                          title={folder.name}
                          color={coverColors[folder.color]}
                          drawing={coverDrawings[folder.cover]}
                          {...(folder.cover === "none"
                            ? { figure: <View /> }
                            : {})}
                          notes={folder.noteCount}
                          sources={folder.sourceCount}
                          onPress={() =>
                            navigation.navigate("Notebook", {
                              folderId: folder.id,
                            })
                          }
                        />
                      ))}
                </ScrollView>
              </View>
            )
          ) : tab === "notes" ? (
            <View>
              <View style={styles.notesToolbar}>
                <Text style={{ fontSize: 13, color: "#6E6E6E" }}>
                  Sorted by last edited
                </Text>
                <Button
                  icon="plus"
                  variant="secondary"
                  accessibilityLabel="Create a new note"
                  hitSlop={6}
                  busy={creating}
                  onPress={() => void newNote()}
                >
                  New note
                </Button>
              </View>
              {library.notes === undefined && !library.error ? (
                [0, 1, 2, 3].map((index) => <SkeletonRow key={index} />)
              ) : !library.notes?.length && !library.error ? (
                <EmptyState
                  title="No notes yet."
                  description="Write a note, or save one of Ruth's answers."
                />
              ) : (
                library.notes?.map((note) => {
                  const folder = note.folderIds[0]
                    ? library.folderById.get(note.folderIds[0])
                    : undefined;
                  const ruth =
                    note.source === "ruth" ||
                    note.source === "ruth-cloud" ||
                    note.source === "chat";
                  return (
                    <Fragment key={note.id}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open note: ${note.title}`}
                        onPress={() => openFile(note)}
                        style={{
                          paddingHorizontal: 20,
                          paddingVertical: 12,
                          gap: 3,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "baseline",
                            gap: 8,
                          }}
                        >
                          <Text
                            variant="rowTitle"
                            numberOfLines={1}
                            style={{ flex: 1 }}
                          >
                            {note.title}
                          </Text>
                          <Text variant="meta">
                            {relativeTime(note.updatedAt, now)}
                          </Text>
                        </View>
                        {note.preview ? (
                          <Text
                            numberOfLines={1}
                            style={{ fontSize: 14, lineHeight: 20 }}
                          >
                            {note.preview}
                          </Text>
                        ) : null}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingTop: 2,
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
                              <Text
                                variant="meta"
                                numberOfLines={1}
                                style={{ flexShrink: 1 }}
                              >
                                {folder.name}
                              </Text>
                            </>
                          ) : null}
                          {folder && ruth ? (
                            <Text variant="meta">·</Text>
                          ) : null}
                          {ruth ? (
                            <Text variant="meta" color="accent-text">
                              Written by Ruth
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                      <Divider />
                    </Fragment>
                  );
                })
              )}
            </View>
          ) : library.sources ? (
            <SourcesTab
              sources={library.sources}
              folderById={library.folderById}
              onOpen={openFile}
              onSelect={(fileId) =>
                navigation.navigate("SourcesSelect", { selectedIds: [fileId] })
              }
              onRemove={trash}
              onMove={(fileId) =>
                navigation.navigate("Move", { fileIds: [fileId] })
              }
            />
          ) : !library.error ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : null}
          {tab === "notebooks" ? (
            <>
              <SectionHeader
                title="Chats and Tasks"
                {...(!firstRun
                  ? {
                      action: "See all",
                      onAction: () => navigation.navigate("Tasks"),
                    }
                  : {})}
                style={{ paddingTop: 26, paddingBottom: 4 }}
              />
              {activity.error ? (
                <View style={styles.error}>
                  <ErrorState
                    message={errorMessage(activity.error)}
                    onRetry={activity.refetch}
                  />
                </View>
              ) : null}
              {activity.items === undefined && !activity.error ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : activity.items?.length === 0 ? (
                <View
                  style={{
                    marginHorizontal: 20,
                    marginTop: 4,
                    padding: 20,
                    gap: 4,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#2E2E2E",
                    borderRadius: 10,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 14,
                      lineHeight: 18,
                      fontWeight: "500",
                    }}
                  >
                    No chats or tasks yet.
                  </Text>
                  <Text
                    variant="meta"
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  >
                    Ask Ruth below, or leave her a task for tonight.
                  </Text>
                </View>
              ) : (
                activity.items?.slice(0, 5).map((item) => (
                  <Fragment
                    key={item.kind === "chat" ? item.thread.id : item.run.id}
                  >
                    <ThreadRow
                      accessibilityLabel={`Open ${item.kind === "chat" ? item.thread.title : item.run.taskTitle}`}
                      title={
                        item.kind === "chat"
                          ? item.thread.title || "New chat"
                          : /^overnight\b/i.test(item.run.taskTitle)
                            ? item.run.taskTitle
                            : `Overnight: ${item.run.taskTitle}`
                      }
                      meta={item.folder?.name ?? "All notebooks"}
                      right={
                        item.kind === "run" && item.run.status === "failed"
                          ? "Didn't finish"
                          : relativeTime(item.at, now)
                      }
                      {...(item.folder
                        ? {
                            leading: (
                              <View
                                style={{ width: 16, justifyContent: "center" }}
                              >
                                <View
                                  style={{
                                    width: 7,
                                    height: 9,
                                    borderRadius: 1,
                                    backgroundColor:
                                      coverColors[item.folder.color],
                                  }}
                                />
                              </View>
                            ),
                          }
                        : {})}
                      {...(item.kind === "run"
                        ? {
                            titleLeading: (
                              <Icon name="cloud" color="#ABC4FF" size={15} />
                            ),
                          }
                        : {})}
                      onPress={() => openActivity(item)}
                    />
                    <Divider />
                  </Fragment>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      </ScrollFade>
      <Composer
        placeholder="Search or ask Ruth"
        value={draft}
        onChangeText={setDraft}
        onFocus={ask}
        onSend={(q) => navigation.navigate("Ask", { q })}
        onAdd={ask}
        expanded={false}
        trailing={
          <>
            <IconButton
              icon="mic"
              accessibilityLabel="Open Ask Ruth composer"
              size={38}
              hitSlop={3}
              onPress={ask}
            />
            <IconButton
              icon="up"
              accessibilityLabel="Ask Ruth"
              size={34}
              hitSlop={5}
              color="#0B1020"
              onPress={ask}
              style={{ backgroundColor: "#ABC4FF" }}
            />
          </>
        }
      />
      <FeatureOverlay
        open={menu}
        onClose={() => setMenu(false)}
        label="Home menu"
        menu
      >
        {menuItems.map((item, index) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            onPress={() => {
              setMenu(false);
              item.action();
            }}
            style={{
              minHeight: 48,
              paddingHorizontal: 16,
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              borderTopWidth: index === 1 ? 1 : 0,
              borderTopColor: "#222222",
            }}
          >
            <Icon name={item.icon} />
            <Text style={{ fontSize: 15, color: "#EDEDED" }}>{item.label}</Text>
          </Pressable>
        ))}
      </FeatureOverlay>
    </Screen>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 22,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  notesToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingBottom: 4,
    paddingLeft: 20,
    paddingRight: 16,
  },
  error: { marginHorizontal: 20, marginTop: 16 },
});
