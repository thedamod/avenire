import { useState, type PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import type { ScreenProps } from "../navigation";
import { colors, notebookColors } from "../theme/tokens";
import { Aside } from "./Aside";
import { ActionBtn, Button, type ButtonVariant } from "./Button";
import { Chip } from "./Chip";
import { Composer } from "./Composer";
import { ComposerTray, type TrayRow } from "./ComposerTray";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { FileIcon, type FileKind } from "./FileIcon";
import { GlassButton } from "./GlassButton";
import { GlassHeader } from "./GlassHeader";
import { Icon, iconPaths, type IconName } from "./Icon";
import { IconButton } from "./IconButton";
import { Input } from "./Input";
import { Keycap } from "./Keycap";
import { Divider, ListRow, SectionHeader, ThreadRow } from "./ListRow";
import { MorningToast } from "./MorningToast";
import { NewNotebookTile, NotebookCover } from "./NotebookCover";
import { Pressable } from "./Pressable";
import { Screen } from "./Screen";
import { ScrollFade } from "./ScrollFade";
import { SegmentedControl } from "./SegmentedControl";
import { SelectionDock } from "./SelectionDock";
import { SheetHeader } from "./Sheet";
import { Skeleton, SkeletonRow } from "./Skeleton";
import { Switch } from "./Switch";
import { Text, textVariants, type TextVariant } from "./Text";
import { UnderlineTabs } from "./UnderlineTabs";

const tabs = [
  { value: "notebooks", label: "Notebooks", count: 5 },
  { value: "notes", label: "Notes", count: 24 },
  { value: "sources", label: "Sources", count: 61 },
] as const;
const buttonVariants: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "destructive",
];
const fileKinds: readonly FileKind[] = ["pdf", "note", "video", "web", "image", "audio", "archive"];
const noOp = () => {};
function Group({
  title,
  children,
  flush = false,
}: PropsWithChildren<{ title: string; flush?: boolean }>) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title={title} />
      <View style={{ paddingHorizontal: flush ? 0 : 20, gap: 12 }}>{children}</View>
      <Divider inset={0} />
    </View>
  );
}
function Wrap({ children }: PropsWithChildren) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      {children}
    </View>
  );
}

/** This is deliberately data-free. Every example operates on gallery-local state. */
export function UiGallery({ navigation }: ScreenProps<"UiGallery">) {
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("notebooks");
  const [segment, setSegment] = useState("propose");
  const [enabled, setEnabled] = useState(true);
  const [chip, setChip] = useState(true);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState("Why can't an engine beat Carnot?");
  const [expanded, setExpanded] = useState(false);
  const [question, setQuestion] = useState("midterm");
  const [notice, setNotice] = useState("Ready");
  const [accepted, setAccepted] = useState(false);
  const notify = (label: string) => {
    setNotice(label);
  };
  const send = (value: string) => {
    notify(`Sent: ${value}`);
    setMessage("");
  };
  const changes: readonly TrayRow[] = [
    {
      key: "create",
      label: "Create note · Summary: Entropy …",
      detail: "in Thermodynamics",
      leading: <Icon name="plus" size={14} color={colors.green} />,
      trailing: <Text variant="meta">Accepted</Text>,
    },
    {
      key: "move",
      label: "Move · Lecture 8 · Heat …",
      detail: "Unfiled → Thermodynamics",
      leading: <Icon name="move" size={14} color={colors.accent} />,
      actions: [
        { key: "skip", label: "Skip", variant: "ghost", onPress: () => notify("Skipped move") },
        {
          key: "accept",
          label: accepted ? "Accepted" : "Accept",
          onPress: () => setAccepted(true),
          disabled: accepted,
        },
      ],
    },
    {
      key: "rename",
      label: "Rename · Untitled note (3)",
      detail: "→ Lecture 6 notes",
      leading: <Icon name="pencil" size={14} color={colors.amber} />,
      actions: [
        { key: "skip", label: "Skip", variant: "ghost", onPress: () => notify("Skipped rename") },
        { key: "accept", label: "Accept", onPress: () => notify("Accepted rename") },
      ],
    },
  ];
  const options: readonly TrayRow[] = [
    {
      key: "midterm",
      label: "Midterm · Oct 28",
      detail: "Lectures 1–8, two weeks away",
      selected: question === "midterm",
      onPress: () => setQuestion("midterm"),
    },
    {
      key: "final",
      label: "Final · Dec 12",
      detail: "Everything, eight weeks away",
      selected: question === "final",
      onPress: () => setQuestion("final"),
      trailing: <Keycap>2</Keycap>,
    },
    {
      key: "weekly",
      label: "No exam, just keep up",
      detail: "A light weekly review instead",
      selected: question === "weekly",
      onPress: () => setQuestion("weekly"),
      trailing: <Keycap>3</Keycap>,
    },
  ];
  const gallerySend = (value: string) => notify(`Sent: ${value}`);
  return (
    <Screen edges={["top", "left", "right"]}>
      <GlassHeader
        title="UI gallery"
        subtitle="Paper · mobile foundation"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        trailing={[
          {
            icon: "more",
            accessibilityLabel: "Gallery actions",
            onPress: () => notify("Gallery actions"),
          },
        ]}
      />
      <Text
        variant="meta"
        accessibilityLiveRegion="polite"
        style={{ paddingHorizontal: 20, paddingVertical: 6 }}
      >
        {notice}
      </Text>
      <ScrollFade top={false}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40, gap: 12 }}
        >
          <Group title="M01 · Home chrome" flush>
            <GlassHeader
              title="Avenire"
              large
              trailing={[{ icon: "more", accessibilityLabel: "Home actions", onPress: noOp }]}
            />
            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              <MorningToast onPress={() => notify("Morning report")} />
              <MorningToast failed onPress={() => notify("Run details")} />
            </View>
            <UnderlineTabs items={tabs} value={tab} onValueChange={setTab} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}
            >
              <NewNotebookTile onPress={() => notify("New notebook")} />
              <NotebookCover title="Thermodynamics" notes={9} sources={22} onPress={noOp} />
              <NotebookCover
                title="Ethics Project"
                color={notebookColors.ethics}
                drawing="ethics"
                notes={4}
                sources={11}
              />
              <NotebookCover
                title="Options Pricing"
                color={notebookColors.options}
                drawing="options"
                sources={14}
              />
              <NotebookCover
                title="Organic Chemistry"
                color={notebookColors.ochem}
                drawing="ochem"
                sources={9}
              />
              <NotebookCover
                title="Research Reading"
                color={notebookColors.research}
                drawing="research"
                sources={5}
              />
              <NotebookCover
                title="Statistical Mechanics"
                color={notebookColors.stat}
                drawing="stat"
                meta="Empty"
              />
            </ScrollView>
            <SectionHeader
              title="Chats and Tasks"
              action="See all"
              onAction={() => notify("All chats and tasks")}
            />
            <ThreadRow
              title="Overnight: summary, quiz and revision notes"
              meta="Thermodynamics"
              right="Today"
              leading={
                <View style={{ width: 7, height: 9, backgroundColor: notebookColors.thermo }} />
              }
              titleLeading={<Icon name="cloud" size={15} color={colors.accent} />}
              onPress={noOp}
            />
            <Divider />
            <ThreadRow
              title="Why does entropy only go up?"
              meta="Thermodynamics"
              right="Yesterday"
              onPress={noOp}
            />
          </Group>
          <View style={{ paddingHorizontal: 20 }}>
            <NotebookCover compact title="Thermodynamics" />
          </View>
          <Group title="Text">
            {(Object.keys(textVariants) as TextVariant[]).map((variant) => (
              <Text key={variant} variant={variant}>
                {variant} · Avenire
              </Text>
            ))}
          </Group>
          <Group title="Icons · exact 16-grid paths">
            <Wrap>
              {(Object.keys(iconPaths) as IconName[]).map((name) => (
                <View
                  key={name}
                  style={{ width: 66, alignItems: "center", gap: 6, paddingVertical: 8 }}
                >
                  <Icon name={name} size={18} />
                  <Text variant="mono" style={{ fontSize: 9 }}>
                    {name}
                  </Text>
                </View>
              ))}
            </Wrap>
          </Group>
          <Group title="Buttons and glass">
            <Wrap>
              {buttonVariants.map((variant) => (
                <Button key={variant} variant={variant} onPress={() => notify(variant)}>
                  {variant}
                </Button>
              ))}
            </Wrap>
            <Wrap>
              <Button disabled onPress={noOp}>
                Disabled
              </Button>
              <Button busy onPress={noOp}>
                Saving
              </Button>
              <Button icon="plus" onPress={noOp}>
                Add source
              </Button>
            </Wrap>
            <Wrap>
              <ActionBtn icon="doc" active onPress={noOp}>
                Summary
              </ActionBtn>
              <ActionBtn icon="quiz" onPress={noOp}>
                Quiz
              </ActionBtn>
              <ActionBtn icon="lines" onPress={noOp}>
                Revision
              </ActionBtn>
            </Wrap>
            <Wrap>
              <GlassButton icon="back" accessibilityLabel="Back example" onPress={noOp} />
              <GlassButton icon="panel" accessibilityLabel="Panel example" onPress={noOp} />
              <GlassButton
                icon="moon"
                label="Ask Ruth"
                accent
                accessibilityLabel="Ask Ruth example"
                onPress={noOp}
              />
              <GlassButton
                icon="close"
                size={34}
                accessibilityLabel="Close example"
                onPress={noOp}
              />
              <IconButton icon="download" accessibilityLabel="Download example" onPress={noOp} />
              <IconButton icon="move" active accessibilityLabel="Move example" onPress={noOp} />
            </Wrap>
            <Pressable
              accessibilityRole="button"
              haptic="selection"
              onPress={() => {
                notify("Pressed at scale 0.97");
              }}
              style={{ paddingVertical: 10 }}
            >
              <Text>Press feedback · 0.97</Text>
            </Pressable>
          </Group>
          <Group title="Inputs, switches, segments">
            <Input
              label="Notebook name"
              placeholder="New notebook"
              value={input}
              onChangeText={setInput}
            />
            <Input label="With error" placeholder="Name" error="Enter a notebook name." />
            <Input label="Disabled" value="Thermodynamics" editable={false} />
            <Wrap>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                accessibilityLabel="Morning report"
              />
              <Switch
                value={!enabled}
                onValueChange={(value) => setEnabled(!value)}
                accessibilityLabel="Capture logged-in pages"
              />
              <Switch value disabled onValueChange={noOp} accessibilityLabel="Disabled switch" />
            </Wrap>
            <SegmentedControl
              items={[
                { value: "nothing", label: "Nothing" },
                { value: "propose", label: "Propose, I accept" },
                { value: "apply", label: "On her own" },
              ]}
              value={segment}
              onValueChange={setSegment}
            />
            <Wrap>
              <Chip label="Summary" active={chip} onPress={() => setChip(!chip)} />
              <Chip label="Unfiled" count={3} />
              <Chip label="All notebooks" size={30} leading={<Icon name="folder" size={13} />} />
              <Chip
                label="Organic Chemistry"
                size={32}
                leading={
                  <View style={{ width: 7, height: 9, backgroundColor: notebookColors.ochem }} />
                }
              />
              <Keycap>⌘</Keycap>
              <Keycap>1</Keycap>
            </Wrap>
          </Group>
          <Group title="Lists, asides, and empty states" flush>
            <ListRow
              title="Lecture 8 · Heat engines.pdf"
              subtitle="canvas.university.edu"
              leading={<FileIcon type="pdf" />}
              meta="Today"
              onPress={noOp}
              chevron
            />
            <Divider />
            <ListRow
              title="Morning report"
              subtitle="When the overnight run finishes"
              trailing={
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  accessibilityLabel="Morning report notifications"
                />
              }
            />
            <View style={{ paddingHorizontal: 20, gap: 16 }}>
              <Aside>
                <Text variant="section">Grounded in your sources</Text>
                <Text>Flat structures and a quiet left rule.</Text>
              </Aside>
              <ErrorState
                message="The source could not be opened."
                onRetry={() => notify("Retry requested")}
              />
            </View>
            <EmptyState
              title="Your material starts here"
              description="Capture on your computer. Everything syncs here."
              icon="laptop"
              action={
                <Button variant="secondary" onPress={noOp}>
                  Learn more
                </Button>
              }
            />
            <Wrap>
              {fileKinds.map((type) => (
                <View key={type} style={{ width: 42, alignItems: "center", gap: 6 }}>
                  <FileIcon type={type} framed />
                  <Text variant="meta" style={{ fontSize: 9 }}>
                    {type}
                  </Text>
                </View>
              ))}
            </Wrap>
            <View style={{ paddingHorizontal: 20 }}>
              <FileIcon type="web" url="https://en.wikipedia.org/wiki/Carnot_cycle" />
            </View>
          </Group>
          <Group title="M12 · Header and capsule" flush>
            <GlassHeader
              title="Morning report"
              subtitle="Thermodynamics · Tue, Oct 14"
              onBack={noOp}
              trailing={[{ icon: "panel", accessibilityLabel: "Open outputs", onPress: noOp }]}
            />
            <Composer
              floating={false}
              value={message}
              onChangeText={setMessage}
              onSend={send}
              onAdd={() => notify("Add source")}
              onMic={() => notify("Microphone")}
            />
            <Composer
              floating={false}
              value={message}
              onChangeText={setMessage}
              onSend={send}
              onAdd={noOp}
              onMic={noOp}
              tray={
                <ComposerTray
                  title="3 file changes"
                  meta="1 accepted · 2 waiting"
                  expanded={expanded}
                  onToggle={() => setExpanded(!expanded)}
                  inlineAction={
                    !expanded
                      ? {
                          key: "accept",
                          label: "Accept all",
                          variant: "primary",
                          onPress: () => notify("Accepted all changes"),
                        }
                      : undefined
                  }
                  rows={changes}
                  actions={[
                    { key: "skip", label: "Skip all", variant: "ghost", onPress: noOp },
                    { key: "accept", label: "Accept all", variant: "primary", onPress: noOp },
                  ]}
                />
              }
            />
          </Group>
          <Group title="M17 · Expanded changes" flush>
            <Composer
              floating={false}
              value={message}
              onChangeText={setMessage}
              onSend={send}
              onAdd={noOp}
              onMic={noOp}
              tray={
                <ComposerTray
                  title="3 file changes"
                  meta="1 accepted · 2 waiting"
                  expanded
                  onToggle={noOp}
                  rows={changes}
                  actions={[
                    { key: "skip", label: "Skip all", variant: "ghost", onPress: noOp },
                    { key: "accept", label: "Accept all", variant: "primary", onPress: noOp },
                  ]}
                />
              }
            />
          </Group>
          <Group title="M22 · Approval" flush>
            <Composer
              floating={false}
              value={message}
              onChangeText={setMessage}
              onSend={send}
              onAdd={noOp}
              onMic={noOp}
              tray={
                <ComposerTray
                  title="Allow Ruth to change files?"
                  meta="Move 2 duplicates to Trash"
                  expanded
                  onToggle={noOp}
                  rows={[
                    {
                      key: "duplicate",
                      label: "Screenshot 2026-10-09.png",
                      detail: "Duplicate",
                      leading: <Icon name="trash" size={14} />,
                    },
                    {
                      key: "kept",
                      label: "Lecture 7 · Entropy.pdf",
                      detail: "Kept · has your 6 highlights",
                      leading: <Icon name="check" color={colors.green} size={14} />,
                    },
                  ]}
                  startAction={{
                    key: "always",
                    label: "Always allow",
                    variant: "ghost",
                    onPress: noOp,
                  }}
                  actions={[
                    { key: "decline", label: "Decline", onPress: noOp },
                    { key: "approve", label: "Approve", variant: "primary", onPress: noOp },
                  ]}
                />
              }
            />
          </Group>
          <Group title="M23 · Question" flush>
            <Composer
              floating={false}
              value={message}
              onChangeText={setMessage}
              onSend={send}
              onAdd={noOp}
              onMic={noOp}
              tray={
                <ComposerTray
                  title="Which exam should the plan build up to?"
                  meta="Ruth needs one answer to continue"
                  step="1/2"
                  expanded
                  onToggle={noOp}
                  rows={options}
                  startAction={{ key: "skip", label: "Skip", variant: "ghost", onPress: noOp }}
                  actions={[
                    {
                      key: "next",
                      label: "Next",
                      variant: "primary",
                      onPress: () => notify(`Selected ${question}`),
                    },
                  ]}
                />
              }
            />
            <Composer
              floating={false}
              value=""
              onChangeText={noOp}
              onSend={noOp}
              tray={
                <ComposerTray
                  title="The run could not finish"
                  meta="Your files are safe"
                  icon="alert"
                  tone="danger"
                  expanded
                  actions={[
                    { key: "retry", label: "Try again", variant: "primary", onPress: noOp },
                  ]}
                />
              }
            />
          </Group>
          <Group title="M07/M08 · Focused composer" flush>
            <Composer
              floating={false}
              expanded
              value={draft}
              onChangeText={setDraft}
              onSend={gallerySend}
              onAdd={noOp}
              controls={[
                { key: "ruth", label: "Ruth", icon: "moon", onPress: noOp },
                {
                  key: "notebook",
                  label: "This notebook",
                  swatch: notebookColors.thermo,
                  onPress: noOp,
                },
                { key: "time", label: "Now", icon: "clock", onPress: noOp },
              ]}
            />
            <Composer
              floating={false}
              value=""
              onChangeText={noOp}
              onSend={noOp}
              leading={
                <IconButton icon="folder" accessibilityLabel="Custom leading slot" onPress={noOp} />
              }
              trailing={
                <Button variant="ghost" onPress={noOp}>
                  Search
                </Button>
              }
            />
          </Group>
          <Group title="M27/M31 · Selection dock" flush>
            <SelectionDock
              floating={false}
              count={2}
              actions={[
                { icon: "move", accessibilityLabel: "Move selected", active: true, onPress: noOp },
                {
                  icon: "moon",
                  accessibilityLabel: "Ask Ruth about selected",
                  color: colors.accent,
                  onPress: noOp,
                },
                { icon: "split", accessibilityLabel: "Compare selected", onPress: noOp },
                { icon: "download", accessibilityLabel: "Download selected", onPress: noOp },
                {
                  icon: "trash",
                  accessibilityLabel: "Trash selected",
                  color: colors.red,
                  onPress: noOp,
                },
              ]}
            />
            <SelectionDock
              floating={false}
              count={2}
              actions={[
                { icon: "restore", accessibilityLabel: "Restore selected", onPress: noOp },
                {
                  icon: "trash",
                  accessibilityLabel: "Delete forever",
                  color: colors.red,
                  onPress: noOp,
                },
              ]}
            />
          </Group>
          <Group title="Sheets and loading" flush>
            <SheetHeader
              title="New notebook"
              subtitle="A place for related material"
              onClose={noOp}
              grabber
            />
            <View style={{ marginHorizontal: 20, height: 140 }}>
              <ScrollFade>
                <ScrollView>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </ScrollView>
              </ScrollFade>
            </View>
            <View style={{ paddingHorizontal: 20, gap: 8 }}>
              <Skeleton />
              <Skeleton width="60%" />
              <Skeleton width={36} height={36} radius={8} />
            </View>
          </Group>
        </ScrollView>
      </ScrollFade>
    </Screen>
  );
}
