import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import type { CloudTask, FolderId } from "@avenire/contracts";
import { useApi } from "../../state/api";
import { colors } from "../../theme/tokens";
import {
  Aside,
  Button,
  ErrorState,
  Icon,
  Input,
  Pressable,
  ScrollFade,
  SkeletonRow,
  Switch,
  Text,
  errorMessage,
  type IconName,
} from "../../ui";
import { ChoiceSheet, FeatureSheetHeader as SheetHeader } from "./FeatureOverlay";
import { notebookColor } from "./notebookColor";
import { useScheduleData } from "./data";
import {
  READY_TIMES,
  formatClock,
  fromRules,
  fromSchedule,
  repeatLabel,
  toRules,
  toSchedule,
  type Repeat,
} from "./schedule";
import { TASK_OUTPUTS, readTaskOutputs, writeTaskOutputs, type TaskOutput } from "./task-outputs";

const outputIcons: readonly IconName[] = ["doc", "quiz", "lines", "widget", "video", "image"];
function OptionButton({
  label,
  selected,
  onPress,
  icon,
  swatch,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  swatch?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.option, { backgroundColor: selected ? colors["surface-4"] : "transparent" }]}
    >
      {swatch ? (
        <View style={{ width: 7, height: 9, borderRadius: 1, backgroundColor: swatch }} />
      ) : null}
      {icon ? <Icon name={icon} size={13} color={selected ? colors.fg : colors["fg-2"]} /> : null}
      <Text
        style={{
          fontSize: 12,
          lineHeight: 16,
          fontWeight: selected ? "500" : "400",
          color: selected ? colors.fg : colors["fg-2"],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Creation and editing use the same prompt encoding and hydration rules as web. */
export function TaskScheduleForm({
  task,
  onClose,
  onSaved,
}: {
  task?: CloudTask;
  onClose: () => void;
  onSaved?: (task: CloudTask) => void;
}) {
  const api = useApi();
  const { folders, settings } = useScheduleData();
  const [initial] = useState(() => ({
    ...(task ? fromSchedule(task.schedule) : { repeat: "weeknights" as Repeat, readyBy: "07:00" }),
    ...(task
      ? fromRules(task.preHydration)
      : { folderIds: [] as FolderId[], todaysCaptures: true }),
    ...(task
      ? readTaskOutputs(task.prompt)
      : { instructions: "", outputs: ["Summary", "Quiz", "Revision"] as TaskOutput[] }),
  }));
  const [title, setTitle] = useState(task?.title ?? "");
  const [instructions, setInstructions] = useState(initial.instructions);
  const [outputs, setOutputs] = useState<TaskOutput[]>(initial.outputs);
  const [folderIds, setFolderIds] = useState<FolderId[]>(initial.folderIds);
  const [captures, setCaptures] = useState(initial.todaysCaptures);
  const [network, setNetwork] = useState(task?.network ?? "packages");
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat);
  const [readyBy, setReadyBy] = useState(initial.readyBy);
  const [scopeChanged, setScopeChanged] = useState(false);
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const [email, setEmail] = useState(task?.delivery.email ?? false);
  const [more, setMore] = useState(false);
  const [choice, setChoice] = useState<"repeat" | "time">();
  const [scrolled, setScrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const locked = useRef(false);
  const prompt = writeTaskOutputs(instructions, outputs);
  const valid = title.trim().length > 0 && prompt.length > 0 && prompt.length <= 20_000;
  const activeFolders = (folders.data ?? []).filter(
    (folder) => folder.archivedAt === null || folderIds.includes(folder.id),
  );
  const visibleFolders = more
    ? activeFolders
    : activeFolders.filter((folder, i) => i < 2 || folderIds.includes(folder.id));
  async function save() {
    if (!valid || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const input = {
      title: title.trim(),
      prompt,
      network,
      schedule: task && !scheduleChanged ? task.schedule : toSchedule(repeat, readyBy),
      timeZone:
        task && !scheduleChanged
          ? task.timeZone
          : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      preHydration: task && !scopeChanged ? task.preHydration : toRules(folderIds, captures),
      delivery: { email },
    };
    try {
      const saved = task
        ? await call(api, (client) => client["cloud.updateTask"]({ taskId: task.id, patch: input }))
        : await call(api, (client) => client["cloud.createTask"]({ ...input, enabled: true }));
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.sheet }}>
      <SheetHeader title={task ? "Edit overnight task" : "New overnight task"} onClose={onClose} />
      <ScrollFade color={colors.sheet} top={scrolled}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 6,
            paddingBottom: 24,
            gap: 18,
          }}
        >
          <Input
            label="Task"
            value={title}
            onChangeText={setTitle}
            maxLength={200}
            multiline
            placeholder="Turn today's lectures into revision material"
            style={styles.multiline}
          />
          <Input
            label="Instructions"
            value={instructions}
            onChangeText={setInstructions}
            maxLength={20_000}
            multiline
            placeholder="Keep the quiz to 8 questions and use my notes' wording."
            style={styles.multiline}
          />
          <View style={{ gap: 8 }}>
            <Text variant="label">Ruth can read</Text>
            {folders.loading && !folders.data ? (
              <SkeletonRow />
            ) : folders.error && !folders.data ? (
              <ErrorState
                message="Couldn't load notebooks."
                onRetry={() => void folders.refetch()}
              />
            ) : null}
            <View style={styles.options}>
              {visibleFolders.map((folder) => (
                <OptionButton
                  key={folder.id}
                  label={folder.name}
                  swatch={notebookColor(folder.color)}
                  selected={folderIds.includes(folder.id)}
                  onPress={() => {
                    setScopeChanged(true);
                    setFolderIds((ids) =>
                      ids.includes(folder.id)
                        ? ids.filter((id) => id !== folder.id)
                        : [...ids, folder.id],
                    );
                  }}
                />
              ))}
              <OptionButton
                label="Today's captures"
                selected={captures}
                onPress={() => {
                  setScopeChanged(true);
                  setCaptures(!captures);
                }}
              />
              <OptionButton
                label="The web"
                selected={network === "open"}
                onPress={() => setNetwork(network === "open" ? "packages" : "open")}
              />
              {activeFolders.length > 2 ? (
                <OptionButton
                  label={more ? "Less" : "More"}
                  icon={more ? "chevU" : "plus"}
                  selected={false}
                  onPress={() => setMore(!more)}
                />
              ) : null}
            </View>
            {!folderIds.length && !captures ? (
              <Text variant="meta">No notebooks or captures selected.</Text>
            ) : null}
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="label">Make</Text>
            <View style={styles.options}>
              {TASK_OUTPUTS.map((output, index) => (
                <OptionButton
                  key={output}
                  label={output}
                  icon={outputIcons[index]!}
                  selected={outputs.includes(output)}
                  onPress={() =>
                    setOutputs((items) =>
                      items.includes(output)
                        ? items.filter((item) => item !== output)
                        : [...items, output],
                    )
                  }
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text variant="label">Ruth can change</Text>
            <View style={styles.options}>
              <OptionButton label="Nothing" selected={false} disabled onPress={() => {}} />
              <OptionButton label="Propose, I accept" selected disabled onPress={() => {}} />
              <OptionButton label="On her own" selected={false} disabled onPress={() => {}} />
            </View>
            <Aside>
              <Text variant="meta">
                Cloud proposes changes for you to accept. Per-task access controls aren't available
                yet.
              </Text>
            </Aside>
          </View>
          <View
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              paddingTop: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text color="fg">Email me when it's ready</Text>
              <Text variant="meta">The report is always on home.</Text>
            </View>
            <View style={{ minHeight: 44, justifyContent: "center" }}>
              <Switch
                value={email}
                onValueChange={setEmail}
                accessibilityLabel="Email me when it's ready"
              />
            </View>
          </View>
          {error ? <ErrorState message={error} /> : null}
          {prompt.length > 20_000 ? (
            <ErrorState message="Instructions and output choices must fit within 20,000 characters." />
          ) : null}
        </ScrollView>
      </ScrollFade>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.line,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button
            variant="secondary"
            accessibilityLabel="Choose repeat schedule"
            hitSlop={6}
            onPress={() => setChoice("repeat")}
            style={{ flex: 1, height: 36 }}
          >
            <Text color="fg" style={{ flex: 1, fontSize: 14 }}>
              {repeatLabel(repeat)}
            </Text>
            <Icon name="chevD" size={12} />
          </Button>
          <Button
            variant="secondary"
            accessibilityLabel="Choose ready by time"
            hitSlop={6}
            onPress={() => setChoice("time")}
            style={{ flex: 1, height: 36 }}
          >
            <Text color="fg" style={{ flex: 1, fontSize: 14 }}>
              By {formatClock(readyBy)}
            </Text>
            <Icon name="chevD" size={12} />
          </Button>
        </View>
        <Button
          accessibilityLabel={task ? "Save task" : "Schedule task"}
          hitSlop={6}
          busy={busy}
          disabled={!valid}
          onPress={() => void save()}
          style={{ backgroundColor: colors.accent }}
        >
          <Text style={{ color: colors["on-accent"], fontSize: 13, fontWeight: "500" }}>
            {task ? "Save" : "Schedule"}
          </Text>
        </Button>
        {settings.data ? (
          <Text variant="meta" style={{ textAlign: "center" }}>
            {Math.max(
              0,
              settings.data.usage.overnightRunLimit - settings.data.usage.overnightRunsThisWeek,
            )}{" "}
            of {settings.data.usage.overnightRunLimit} overnight runs left this week
          </Text>
        ) : null}
      </View>
      <ChoiceSheet
        title="Repeat"
        visible={choice === "repeat"}
        value={repeat}
        options={(["tonight", "nightly", "weeknights"] as const).map((value) => ({
          value,
          label: repeatLabel(value),
        }))}
        onChange={(value) => {
          setRepeat(value);
          setScheduleChanged(true);
        }}
        onClose={() => setChoice(undefined)}
      />
      <ChoiceSheet
        title="Ready by"
        visible={choice === "time"}
        value={readyBy}
        options={[...new Set([...READY_TIMES, readyBy])]
          .sort()
          .map((value) => ({ value, label: formatClock(value) }))}
        onChange={(value) => {
          setReadyBy(value);
          setScheduleChanged(true);
        }}
        onClose={() => setChoice(undefined)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  multiline: {
    height: 64,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: "top",
    borderRadius: 8,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  option: {
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors["line-2"],
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
