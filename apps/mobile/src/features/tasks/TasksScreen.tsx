import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useReducedMotion } from "react-native-reanimated";
import type { CloudRun, CloudTask, Folder, FolderId, RuthThread } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import { colors } from "../../theme/tokens";
import {
  Button,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  GlassButton,
  GlassHeader,
  Icon,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { FeatureOverlay, FeatureSheetHeader } from "./FeatureOverlay";
import { TaskScheduleForm } from "./TaskScheduleForm";
import { runStatus, runTime, useTaskActions, useTaskActivity } from "./data";
import { describeSchedule, fromRules } from "./schedule";
import { notebookColor } from "./notebookColor";

type Filter = "all" | "chats" | "overnight" | "scheduled";
type Activity =
  | { kind: "chat"; at: string; thread: RuthThread }
  | { kind: "run"; at: string; run: CloudRun };
function groupLabel(at: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - Date.parse(at)) / 86_400_000) + 1;
  return days <= 0 ? "Today" : days < 7 ? "This week" : days < 31 ? "This month" : "Earlier";
}
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      variant="meta"
      style={{
        paddingTop: 16,
        paddingBottom: 4,
        paddingHorizontal: 20,
        fontSize: 13,
        lineHeight: 18,
      }}
    >
      {children}
    </Text>
  );
}

function ScheduledRow({
  task,
  busy,
  onOpen,
  onAction,
  onEdit,
  onMenu,
}: {
  task: CloudTask;
  busy: boolean;
  onOpen: () => void;
  onAction: (action: "run" | "toggle" | "delete") => void;
  onEdit: () => void;
  onMenu: () => void;
}) {
  const swipe = useRef<SwipeableMethods>(null);
  const reduced = useReducedMotion();
  const invoke = (fn: () => void) => {
    swipe.current?.close();
    fn();
  };
  const actions = [
    {
      label: "Run now",
      color: colors.accent,
      foreground: colors["on-accent"],
      onPress: () => onAction("run"),
    },
    {
      label: task.enabled ? "Pause" : "Resume",
      color: "#3A3A3C",
      foreground: colors.fg,
      onPress: () => onAction("toggle"),
    },
    { label: "Edit", color: "#2C2C2E", foreground: colors.fg, onPress: onEdit },
    ...(!task.builtin
      ? [
          {
            label: "Delete",
            color: "#2A1416",
            foreground: colors.red,
            onPress: () => onAction("delete"),
          },
        ]
      : []),
  ];
  return (
    <ReanimatedSwipeable
      ref={swipe}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
      animationOptions={reduced ? { duration: 0 } : { damping: 24, stiffness: 240 }}
      renderRightActions={() => (
        <View style={{ flexDirection: "row" }}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={`${action.label} ${task.title}`}
              disabled={busy}
              onPress={() => invoke(action.onPress)}
              style={{
                width: 62,
                minHeight: 64,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: action.color,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 16,
                  fontWeight: "600",
                  color: action.foreground,
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.enabled ? describeSchedule(task.schedule) : "Paused"}. Swipe left for task actions.`}
        accessibilityHint="Long press for task actions"
        onPress={onOpen}
        onLongPress={onMenu}
        accessibilityActions={[{ name: "actions", label: "Task actions" }]}
        onAccessibilityAction={() => onMenu()}
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: colors.bg,
        }}
      >
        <Icon name="clock" color={task.enabled ? colors.accent : colors["fg-3"]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {task.title}
          </Text>
          <Text variant="meta" style={{ fontSize: 13, lineHeight: 17 }} numberOfLines={1}>
            {task.enabled ? describeSchedule(task.schedule) : "Paused"} · asks first
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function ActivityRow({
  item,
  folder,
  pending,
  onPress,
}: {
  item: Activity;
  folder: Folder | undefined;
  pending: number;
  onPress: () => void;
}) {
  const status = item.kind === "run" ? runStatus(item.run, pending) : undefined;
  const title =
    item.kind === "chat"
      ? item.thread.title || "New chat"
      : /^overnight\b/i.test(item.run.taskTitle)
        ? item.run.taskTitle
        : `Overnight · ${item.run.taskTitle}`;
  const at = new Date(item.at);
  const time =
    groupLabel(item.at) === "Today"
      ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : at.toLocaleDateString(undefined, { weekday: "short" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${folder?.name ?? "All notebooks"}, ${status?.label ?? time}`}
      onPress={onPress}
      style={{ paddingHorizontal: 20, paddingTop: 11, paddingBottom: 12, gap: 3 }}
    >
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <View style={{ width: 16, alignItems: "center" }}>
          {folder ? (
            <View
              style={{
                width: 7,
                height: 9,
                borderRadius: 1,
                backgroundColor: notebookColor(folder.color),
              }}
            />
          ) : (
            <Icon name="folder" size={13} color={colors["fg-3"]} />
          )}
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17 }}>
          {folder?.name ?? "All notebooks"}
          {item.kind === "run" ? ` · ${time}` : ""}
        </Text>
        <Text variant="meta" style={status ? { color: status.color } : undefined}>
          {status?.label ?? time}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
        <View style={{ width: 16 }}>
          <Icon name={item.kind === "chat" ? "chat" : "moon"} size={15} color={colors["fg-3"]} />
        </View>
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

export function TasksScreen({ navigation }: ScreenProps<"Tasks">) {
  const activity = useTaskActivity();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<CloudTask>();
  const [menuTask, setMenuTask] = useState<CloudTask>();
  const [scrolled, setScrolled] = useState(false);
  const { threads, tasks, runs, folders, approvals } = activity;
  const refresh = useCallback(() => {
    void threads.refetch();
    void tasks.refetch();
    void runs.refetch();
    void folders.refetch();
    void approvals.refetch();
  }, [threads.refetch, tasks.refetch, runs.refetch, folders.refetch, approvals.refetch]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const actions = useTaskActions(refresh);
  const chats = (threads.data ?? []).filter((thread) => thread.kind === "chat");
  const items = useMemo<Activity[]>(
    () =>
      [
        ...(threads.data ?? [])
          .filter((thread) => thread.kind === "chat")
          .map((thread) => ({
            kind: "chat" as const,
            thread,
            at: thread.lastMessageAt ?? thread.updatedAt,
          })),
        ...(runs.data ?? []).map((run) => ({ kind: "run" as const, run, at: runTime(run) })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [threads.data, runs.data],
  );
  const filtered = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "chats" ? item.kind === "chat" : filter === "overnight" && item.kind === "run"),
  );
  const groups = new Map<string, Activity[]>();
  for (const item of filtered) {
    const label = groupLabel(item.at);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const folderById = new Map<FolderId, Folder>(
    (folders.data ?? []).map((folder) => [folder.id, folder]),
  );
  const showTasks = filter === "all" || filter === "scheduled";
  const loading =
    filter === "chats"
      ? threads
      : filter === "overnight"
        ? runs
        : filter === "scheduled"
          ? tasks
          : undefined;
  const initialLoading = loading
    ? loading.loading && !loading.data
    : [threads, runs, tasks].some((query) => query.loading && !query.data);
  const deleteTask = (task: CloudTask) =>
    Alert.alert(
      "Delete this task?",
      "Ava stops running it. Past morning reports and anything you accepted stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete task",
          style: "destructive",
          onPress: () => void actions.mutate(task, "delete"),
        },
      ],
    );
  const counts = {
    all: items.length + (tasks.data?.length ?? 0),
    chats: chats.length,
    overnight: runs.data?.length ?? 0,
    scheduled: tasks.data?.length ?? 0,
  };
  return (
    <Screen>
      <GlassHeader
        title=""
        leading={
          <GlassButton
            icon="back"
            accessibilityLabel="Back"
            hitSlop={2}
            onPress={() => navigation.goBack()}
          />
        }
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        trailing={[
          {
            icon: "moon",
            label: "New task",
            accessibilityLabel: "Schedule a new overnight task",
            hitSlop: 2,
            onPress: () => navigation.navigate("ScheduleTask"),
          },
        ]}
      />
      <Text
        color="fg"
        style={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 12,
          fontSize: 28,
          lineHeight: 34,
          fontWeight: "600",
          letterSpacing: -0.56,
        }}
      >
        Chats and Tasks
      </Text>
      <View style={{ height: 44 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 6,
            paddingBottom: 6,
            gap: 12,
          }}
        >
          {(["all", "chats", "overnight", "scheduled"] as const).map((value) => (
            <Chip
              key={value}
              label={
                { all: "All", chats: "Chats", overnight: "Overnight", scheduled: "Scheduled" }[
                  value
                ]
              }
              accessibilityLabel={`Show ${value}, ${counts[value]}`}
              count={counts[value]}
              active={filter === value}
              hitSlop={9}
              onPress={() => setFilter(value)}
            />
          ))}
        </ScrollView>
      </View>
      <ScrollFade top={scrolled}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 30 }}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={Boolean(
                (threads.loading || tasks.loading || runs.loading) &&
                (threads.data || tasks.data || runs.data),
              )}
              onRefresh={refresh}
              tintColor={colors["fg-2"]}
            />
          }
        >
          {[
            { label: "chats", query: threads },
            { label: "runs", query: runs },
            { label: "scheduled tasks", query: tasks },
            { label: "notebooks", query: folders },
            { label: "approvals", query: approvals },
          ]
            .filter(({ query }) => query.error)
            .map(({ label, query }) => (
              <View key={label} style={{ padding: 20 }}>
                <ErrorState
                  message={`Couldn't load ${label}. ${errorMessage(query.error)}`}
                  onRetry={() => void query.refetch()}
                />
              </View>
            ))}
          {actions.error ? (
            <View style={{ padding: 20 }}>
              <ErrorState message={actions.error} />
            </View>
          ) : null}
          {actions.notice ? (
            <Text
              accessibilityLiveRegion="polite"
              variant="meta"
              style={{ paddingHorizontal: 20, paddingVertical: 8 }}
            >
              {actions.notice}
            </Text>
          ) : null}
          {showTasks && tasks.data?.length ? (
            <>
              <SectionLabel>Scheduled</SectionLabel>
              {tasks.data.map((task) => (
                <ScheduledRow
                  key={task.id}
                  task={task}
                  busy={actions.busy}
                  onMenu={() => setMenuTask(task)}
                  onOpen={() => navigation.navigate("TaskDetail", { taskId: task.id })}
                  onEdit={() => setEditing(task)}
                  onAction={(action) =>
                    action === "delete" ? deleteTask(task) : void actions.mutate(task, action)
                  }
                />
              ))}
            </>
          ) : null}
          {initialLoading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : null}
          {[...groups].map(([label, rows]) => (
            <View key={label}>
              <SectionLabel>{label}</SectionLabel>
              {rows.map((item, index) => {
                const folderId =
                  item.kind === "chat"
                    ? item.thread.folderId
                    : (item.run.folderId ??
                      fromRules(
                        tasks.data?.find((task) => task.id === item.run.taskId)?.preHydration ?? [],
                      ).folderIds[0]);
                return (
                  <View key={`${item.kind}-${item.kind === "chat" ? item.thread.id : item.run.id}`}>
                    {index ? <Divider /> : null}
                    <ActivityRow
                      item={item}
                      folder={folderId ? folderById.get(folderId) : undefined}
                      pending={
                        item.kind === "run"
                          ? (approvals.data ?? []).filter(
                              (approval) =>
                                approval.runId === item.run.id && approval.status === "pending",
                            ).length
                          : 0
                      }
                      onPress={() =>
                        item.kind === "chat"
                          ? navigation.navigate("Chat", { threadId: item.thread.id })
                          : navigation.navigate("TaskDetail", { taskId: item.run.taskId })
                      }
                    />
                  </View>
                );
              })}
            </View>
          ))}
          {!initialLoading &&
          !filtered.length &&
          (!showTasks || !tasks.data?.length) &&
          ![threads, runs, tasks].some((query) => query.error) ? (
            <EmptyState
              title={
                filter === "scheduled" ? "No scheduled tasks" : "No chats or overnight runs yet"
              }
              description="Leave Ava something to do overnight."
              icon="moon"
              action={
                <Button
                  accessibilityLabel="Schedule an overnight task"
                  hitSlop={6}
                  onPress={() => navigation.navigate("ScheduleTask")}
                >
                  New overnight task
                </Button>
              }
            />
          ) : null}
        </ScrollView>
      </ScrollFade>
      <FeatureOverlay visible={Boolean(editing)} onClose={() => setEditing(undefined)} full>
        {editing ? (
          <TaskScheduleForm
            key={editing.id}
            task={editing}
            onClose={() => setEditing(undefined)}
            onSaved={refresh}
          />
        ) : null}
      </FeatureOverlay>
      <FeatureOverlay visible={Boolean(menuTask)} onClose={() => setMenuTask(undefined)}>
        <FeatureSheetHeader
          title={menuTask?.title ?? "Task actions"}
          onClose={() => setMenuTask(undefined)}
        />
        {menuTask
          ? [
              { label: "Run now", onPress: () => void actions.mutate(menuTask, "run") },
              {
                label: menuTask.enabled ? "Pause" : "Resume",
                onPress: () => void actions.mutate(menuTask, "toggle"),
              },
              { label: "Edit schedule", onPress: () => setEditing(menuTask) },
              ...(!menuTask.builtin
                ? [{ label: "Delete task", onPress: () => deleteTask(menuTask) }]
                : []),
            ].map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                disabled={actions.busy}
                onPress={() => {
                  setMenuTask(undefined);
                  action.onPress();
                }}
                style={{ minHeight: 48, paddingHorizontal: 20, justifyContent: "center" }}
              >
                <Text
                  color={action.label === "Delete task" ? "red" : "fg"}
                  style={{ fontSize: 15 }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))
          : null}
      </FeatureOverlay>
    </Screen>
  );
}
