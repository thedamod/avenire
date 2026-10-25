import { useCallback, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { ScreenProps } from "../../navigation";
import { colors } from "../../theme/tokens";
import {
  Aside,
  Button,
  Composer,
  Divider,
  EmptyState,
  ErrorState,
  GlassButton,
  Icon,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Switch,
  Text,
  errorMessage,
} from "../../ui";
import { FeatureOverlay, FeatureSheetHeader as SheetHeader } from "./FeatureOverlay";
import { TaskScheduleForm } from "./TaskScheduleForm";
import { TaskErrorTray } from "./TaskErrorTray";
import {
  runDuration,
  runStatus,
  runTime,
  useTaskActions,
  useTaskDetail,
  useTaskFollowUp,
} from "./data";
import { describeSchedule, fromRules } from "./schedule";

export function TaskDetailScreen({ navigation, route }: ScreenProps<"TaskDetail">) {
  const { tasks, runs, folders, task } = useTaskDetail(route.params.taskId);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [message, setMessage] = useState("");
  const [trayExpanded, setTrayExpanded] = useState(true);
  const [selectedRun, setSelectedRun] = useState<string>();
  const [scrolled, setScrolled] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const sendLock = useRef(false);
  const createFollowUp = useTaskFollowUp();
  const refresh = useCallback(() => {
    void tasks.refetch();
    void runs.refetch();
    void folders.refetch();
  }, [tasks.refetch, runs.refetch, folders.refetch]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  const actions = useTaskActions(refresh);
  const history = [...(runs.data ?? [])].sort((a, b) => runTime(b).localeCompare(runTime(a)));
  const latest = history[0];
  const failed = latest?.status === "failed";
  const selected = history.find((run) => run.id === selectedRun);
  const folderNames = task
    ? fromRules(task.preHydration)
        .folderIds.map((id) => folders.data?.find((folder) => folder.id === id)?.name)
        .filter(Boolean)
        .join(" + ")
    : "";
  async function followUp(value: string) {
    if (!task || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setSendError(undefined);
    try {
      const thread = await createFollowUp(task);
      navigation.navigate("Chat", {
        threadId: thread.id,
        q: `About my overnight task “${task.title}”: ${latest?.error ? `The run stopped: ${latest.error}\n\n` : ""}${value}`,
      });
      setMessage("");
    } catch (cause) {
      setSendError(errorMessage(cause));
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }
  function remove() {
    if (!task || task.builtin) return;
    setMenu(false);
    Alert.alert(
      "Delete this task?",
      "Ruth stops running it. Past morning reports and anything you accepted stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete task",
          style: "destructive",
          onPress: () =>
            void actions.mutate(task, "delete").then((ok) => {
              if (ok) navigation.goBack();
            }),
        },
      ],
    );
  }
  return (
    <Screen edges={["top", "left", "right"]}>
      <View
        style={{
          height: 52,
          paddingHorizontal: 16,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
        }}
      >
        <GlassButton
          icon="back"
          accessibilityLabel="Back to chats and tasks"
          hitSlop={2}
          onPress={() => navigation.goBack()}
        />
        <View style={{ flex: 1, alignItems: "center", gap: 1 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 16, lineHeight: 20, fontWeight: "600", color: colors.fg }}
          >
            {task?.title ?? "Overnight task"}
          </Text>
          <Text
            variant="meta"
            style={{ color: failed ? colors.red : colors["fg-3"], lineHeight: 15 }}
          >
            {failed ? "Didn't finish" : latest ? runStatus(latest).label : "Scheduled"}
          </Text>
        </View>
        <GlassButton
          icon="more"
          accessibilityLabel="Task actions"
          hitSlop={2}
          disabled={!task}
          onPress={() => setMenu(true)}
        />
      </View>
      <ScrollFade top={scrolled}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: 8,
            paddingHorizontal: 20,
            paddingBottom: failed ? 250 : 140,
            gap: 12,
          }}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={Boolean((tasks.loading || runs.loading) && task)}
              onRefresh={refresh}
              tintColor={colors["fg-2"]}
            />
          }
        >
          {!tasks.data && tasks.loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : tasks.error && !tasks.data ? (
            <ErrorState message={errorMessage(tasks.error)} onRetry={() => void tasks.refetch()} />
          ) : !task ? (
            <EmptyState title="This task doesn't exist any more" />
          ) : (
            <>
              {latest ? (
                <View style={{ gap: 4 }}>
                  <Text color="fg" weight="500">
                    {latest.startedAt
                      ? `Ran overnight${runDuration(latest) ? ` for ${runDuration(latest)}` : ""}`
                      : "Didn't start"}
                  </Text>
                  <Text variant="mono" color="fg-3">
                    {new Date(latest.scheduledFor).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {latest.startedAt
                      ? ` · ${new Date(latest.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                      : ""}
                    {latest.finishedAt
                      ? `–${new Date(latest.finishedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                      : ""}
                  </Text>
                </View>
              ) : null}
              {failed && latest ? (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 8,
                      paddingTop: 6,
                    }}
                  >
                    <View style={{ width: 16, paddingTop: 2 }}>
                      <Icon name="alert" color={colors.red} />
                    </View>
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text color="fg">Couldn't finish</Text>
                      <Aside>
                        <Text variant="mono" style={{ lineHeight: 17 }}>
                          {latest.error ?? "The run stopped without saying why."}
                        </Text>
                      </Aside>
                    </View>
                  </View>
                  {latest.summary ? <Text variant="chat">{latest.summary}</Text> : null}
                  <Text color="fg-3">Nothing in your notebooks changed.</Text>
                </>
              ) : latest?.summary ? (
                <Text variant="chat">{latest.summary}</Text>
              ) : null}
              <View
                style={{
                  gap: 12,
                  paddingTop: 12,
                  paddingBottom: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Text>{task.prompt}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text color="fg">{describeSchedule(task.schedule)}</Text>
                    {folderNames ? <Text variant="meta">Reads {folderNames}</Text> : null}
                  </View>
                  <View style={{ minHeight: 44, justifyContent: "center" }}>
                    <Switch
                      value={task.enabled}
                      disabled={actions.busy}
                      onValueChange={() => void actions.mutate(task, "toggle")}
                      accessibilityLabel="Enable scheduled task"
                    />
                  </View>
                </View>
                {!failed ? (
                  <Button
                    variant="secondary"
                    accessibilityLabel="Run task now"
                    hitSlop={6}
                    busy={actions.busy}
                    onPress={() => void actions.mutate(task, "run")}
                  >
                    Run now
                  </Button>
                ) : null}
              </View>
              <Text variant="section" style={{ paddingTop: 8 }}>
                Run history
              </Text>
              {runs.loading && !runs.data ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : runs.error && !runs.data ? (
                <ErrorState
                  message={errorMessage(runs.error)}
                  onRetry={() => void runs.refetch()}
                />
              ) : !history.length ? (
                <Text variant="meta">
                  Hasn't run yet.{task.nextRunAt ? " First run tonight." : ""}
                </Text>
              ) : (
                history.map((run) => (
                  <View key={run.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${new Date(run.scheduledFor).toLocaleDateString()}, ${runStatus(run).label}, attempt ${run.attempt}. Show run details.`}
                      onPress={() => setSelectedRun(run.id)}
                      style={{
                        minHeight: 60,
                        paddingVertical: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 16 }}>
                        <Icon
                          name={
                            run.status === "failed"
                              ? "alert"
                              : run.status === "succeeded"
                                ? "check"
                                : "clock"
                          }
                          color={runStatus(run).color}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text color="fg">
                          {new Date(run.scheduledFor).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                        <Text variant="meta">
                          {runDuration(run) ? `Ran for ${runDuration(run)} · ` : ""}Attempt{" "}
                          {run.attempt}
                        </Text>
                      </View>
                      <Text variant="meta" style={{ color: runStatus(run).color }}>
                        {runStatus(run).label}
                      </Text>
                    </Pressable>
                    <Divider inset={0} />
                  </View>
                ))
              )}
              {actions.notice ? (
                <Text variant="meta" accessibilityLiveRegion="polite">
                  {actions.notice}
                </Text>
              ) : null}
            </>
          )}
          {actions.error || sendError ? <ErrorState message={actions.error ?? sendError!} /> : null}
        </ScrollView>
      </ScrollFade>
      {task ? (
        <Composer
          value={message}
          onChangeText={setMessage}
          onSend={(value) => void followUp(value)}
          sending={sending}
          tray={
            failed && latest ? (
              <TaskErrorTray
                detail={latest.error ?? "The run couldn't finish"}
                expanded={trayExpanded}
                onToggle={() => setTrayExpanded(!trayExpanded)}
                onEdit={() => setEditing(true)}
                onRetry={() => void actions.mutate(task, "run")}
                busy={actions.busy}
              />
            ) : undefined
          }
        />
      ) : null}
      <FeatureOverlay visible={menu} onClose={() => setMenu(false)}>
        <SheetHeader title="Task actions" onClose={() => setMenu(false)} />
        {[
          {
            title: "Run now",
            onPress: () => {
              setMenu(false);
              if (task) void actions.mutate(task, "run");
            },
          },
          {
            title: "Edit schedule",
            onPress: () => {
              setMenu(false);
              setEditing(true);
            },
          },
          ...(!task?.builtin ? [{ title: "Delete task", onPress: remove }] : []),
        ].map((action) => (
          <Pressable
            key={action.title}
            accessibilityRole="button"
            accessibilityLabel={action.title}
            disabled={actions.busy}
            onPress={action.onPress}
            style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 20 }}
          >
            <Text color={action.title === "Delete task" ? "red" : "fg"} style={{ fontSize: 15 }}>
              {action.title}
            </Text>
          </Pressable>
        ))}
      </FeatureOverlay>
      <FeatureOverlay visible={editing} onClose={() => setEditing(false)} full>
        {task ? (
          <TaskScheduleForm
            key={task.id}
            task={task}
            onClose={() => setEditing(false)}
            onSaved={(saved) =>
              tasks.setData((rows) => rows?.map((row) => (row.id === saved.id ? saved : row)))
            }
          />
        ) : null}
      </FeatureOverlay>
      <FeatureOverlay visible={Boolean(selected)} onClose={() => setSelectedRun(undefined)}>
        <SheetHeader
          title={selected ? runStatus(selected).label : "Run details"}
          onClose={() => setSelectedRun(undefined)}
        />
        <ScrollFade top={false} color={colors.sheet} style={{ flex: 0, flexShrink: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            {selected?.error ? (
              <Aside>
                <Text variant="mono">{selected.error}</Text>
              </Aside>
            ) : null}
            <Text>{selected?.summary ?? "No summary was recorded for this run."}</Text>
            {selected?.assets.length ? (
              <Text variant="meta">
                {selected.assets.length} outputs made. Open the morning report on your computer to
                review them.
              </Text>
            ) : null}
          </ScrollView>
        </ScrollFade>
      </FeatureOverlay>
    </Screen>
  );
}
