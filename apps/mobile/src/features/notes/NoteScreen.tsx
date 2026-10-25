import {
  FeatureHeader as GlassHeader,
  FeatureErrorState as ErrorState,
} from "../notebook/FeatureUi";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import type { ScreenProps } from "../../navigation";
import {
  Aside,
  Button,
  Composer,
  Icon,
  Markdown,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { coverColors } from "../notebook/CoverPicker";
import { FeatureOverlay } from "../notebook/FeatureOverlay";
import { plural, relativeTime, useNotebookActions } from "../notebook/data";
import { useNotebooks, useSourceActions } from "../sources/data";
import { citedSourceCount, useNote } from "./data";

export function NoteScreen(props: ScreenProps<"Note">) {
  return <NotePage key={props.route.params.fileId} {...props} />;
}
function NotePage({ route, navigation }: ScreenProps<"Note">) {
  const fileId = route.params.fileId;
  const note = useNote(fileId);
  const { flush } = note;
  const notebooks = useNotebooks();
  const actions = useNotebookActions();
  const sourceActions = useSourceActions();
  const titleInput = useRef<TextInput>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [question, setQuestion] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const folder = notebooks.folders?.find((item) => note.file?.folderIds.includes(item.id));
  const file = note.file;
  const by =
    file?.source === "ruth-cloud"
      ? "Written by Ruth overnight"
      : file?.source === "ruth"
        ? "Written by Ruth"
        : file?.source === "chat"
          ? "Saved from a chat"
          : "Your note";
  const cited = citedSourceCount(note.markdown);
  const saveLabels = {
    saved: "Saved",
    saving: "Saving…",
    conflict: "Not saved",
    error: "Couldn't save",
  };
  useEffect(
    () =>
      navigation.addListener("blur", () => {
        void flush();
      }),
    [navigation, flush],
  );
  async function ask(text: string) {
    if (!(await note.flush())) return;
    const thread = await sourceActions.ask(text, [fileId], folder?.id);
    if (thread) {
      setQuestion("");
      navigation.push("Chat", { threadId: thread.id, q: text });
    }
  }
  async function trash() {
    if (!(await note.flush())) return;
    if (await actions.trashNote(fileId)) {
      setDeleting(false);
      navigation.goBack();
    }
  }
  const error = actions.error ?? sourceActions.error;
  return (
    <Screen edges={["top", "left", "right"]}>
      <GlassHeader
        title=""
        onBack={() => navigation.goBack()}
        trailing={[
          {
            icon: editing ? "check" : "more",
            accessibilityLabel: editing ? "Finish editing note" : "Note actions",
            disabled: !note.note,
            onPress: () => {
              if (editing) {
                setEditing(false);
                void note.flush();
              } else setMenu(true);
            },
          },
        ]}
      />
      <ScrollFade top={scrolled}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 170 }}
        >
          {note.loadError ? (
            <ErrorState message={errorMessage(note.loadError)} onRetry={() => void note.load()} />
          ) : null}
          {!note.note && note.loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : note.note ? (
            <>
              {folder ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open notebook ${folder.name}`}
                  onPress={() => navigation.navigate("Notebook", { folderId: folder.id })}
                  hitSlop={{ top: 10, bottom: 10 }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    alignSelf: "flex-start",
                    paddingBottom: 8,
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 9,
                      borderRadius: 1,
                      backgroundColor: coverColors[folder.color],
                    }}
                  />
                  <Text style={{ fontSize: 13, lineHeight: 18 }}>{folder.name}</Text>
                </Pressable>
              ) : null}
              <TextInput
                ref={titleInput}
                accessibilityLabel="Note title"
                value={note.title}
                maxLength={200}
                placeholder="Untitled"
                placeholderTextColor="#6E6E6E"
                selectionColor="#ABC4FF"
                onChangeText={(title) => note.change({ title: title.replace(/\n/g, " ") })}
                onBlur={() => void note.flush()}
                multiline
                style={{
                  fontSize: 26,
                  lineHeight: 32,
                  fontWeight: "600",
                  letterSpacing: -0.52,
                  padding: 0,
                  color: "#EDEDED",
                }}
              />
              <Text variant="meta" accessibilityLiveRegion="polite" style={{ paddingTop: 6 }}>
                {[
                  by,
                  file?.contentModifiedAt
                    ? `edited by you ${relativeTime(file.contentModifiedAt).toLowerCase()}`
                    : null,
                  cited ? plural(cited, "source") : null,
                  saveLabels[note.status],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {note.status === "conflict" ? (
                <Aside style={{ marginTop: 16 }}>
                  <Text>This note changed elsewhere. Your edits are still here.</Text>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Button
                      accessibilityLabel="Reload latest note and discard local edits"
                      hitSlop={6}
                      variant="secondary"
                      onPress={() => void note.load()}
                    >
                      Reload
                    </Button>
                    <Button
                      accessibilityLabel="Save my edits over the latest revision"
                      hitSlop={6}
                      variant="ghost"
                      onPress={() => void note.keepMine()}
                    >
                      Keep mine
                    </Button>
                  </View>
                </Aside>
              ) : note.saveError ? (
                <View style={{ paddingTop: 16 }}>
                  <ErrorState
                    message={errorMessage(note.saveError)}
                    onRetry={() => void note.flush()}
                  />
                </View>
              ) : null}
              {editing || !note.markdown.trim() ? (
                <TextInput
                  accessibilityLabel="Note markdown"
                  value={note.markdown}
                  onChangeText={(markdown) => note.change({ markdown })}
                  onBlur={() => void note.flush()}
                  multiline
                  autoFocus={editing}
                  textAlignVertical="top"
                  placeholder="Start writing…"
                  placeholderTextColor="#6E6E6E"
                  selectionColor="#ABC4FF"
                  style={{
                    minHeight: 360,
                    marginTop: 22,
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 26,
                    color: "#EDEDED",
                  }}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit note markdown"
                  onPress={() => setEditing(true)}
                  style={{ paddingTop: 22, minHeight: 44 }}
                >
                  <Markdown value={note.markdown} size="note" />
                </Pressable>
              )}
            </>
          ) : null}
          {error ? (
            <View style={{ paddingTop: 16 }}>
              <ErrorState message={errorMessage(error)} />
            </View>
          ) : null}
        </ScrollView>
      </ScrollFade>
      <Composer
        value={question}
        onChangeText={setQuestion}
        onSend={(text) => void ask(text)}
        expanded={false}
        disabled={!note.note}
        sending={sourceActions.busy}
        placeholder="Ask Ruth about this note"
        leading={<Icon name="moon" size={18} color="#ABC4FF" />}
        tray={
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingBottom: 8,
            }}
          >
            <Icon name="note" size={12} />
            <Text variant="meta" numberOfLines={1} style={{ flex: 1 }}>
              This note · {note.title || "Untitled"}
            </Text>
          </View>
        }
      />
      <FeatureOverlay visible={menu} title="Note actions" onClose={() => setMenu(false)}>
        <View style={{ paddingHorizontal: 20, gap: 4 }}>
          <Button
            accessibilityLabel="Edit note"
            variant="ghost"
            style={{ height: 44, justifyContent: "flex-start" }}
            onPress={() => {
              setMenu(false);
              setEditing(true);
            }}
          >
            Edit note
          </Button>
          <Button
            accessibilityLabel="Rename note"
            variant="ghost"
            style={{ height: 44, justifyContent: "flex-start" }}
            onPress={() => {
              setMenu(false);
              titleInput.current?.focus();
            }}
          >
            Rename
          </Button>
          <Button
            accessibilityLabel="Move note to notebook"
            variant="ghost"
            style={{ height: 44, justifyContent: "flex-start" }}
            onPress={() => {
              setMenu(false);
              void note.flush().then((ok) => {
                if (ok) navigation.navigate("Move", { fileIds: [fileId] });
              });
            }}
          >
            Move to notebook
          </Button>
          <Button
            accessibilityLabel="Delete note"
            variant="ghost"
            style={{ height: 44, justifyContent: "flex-start" }}
            onPress={() => {
              setMenu(false);
              setDeleting(true);
            }}
          >
            <Text color="red">Move to Trash</Text>
          </Button>
        </View>
      </FeatureOverlay>
      <FeatureOverlay
        visible={deleting}
        title="Move note to Trash?"
        onClose={() => setDeleting(false)}
      >
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Text>You can restore this note from Trash for 30 days.</Text>
          <Button
            accessibilityLabel="Confirm move note to Trash"
            variant="destructive"
            busy={actions.busy}
            style={{ height: 44 }}
            onPress={() => void trash()}
          >
            Move to Trash
          </Button>
          {actions.error ? <ErrorState message={errorMessage(actions.error)} /> : null}
        </View>
      </FeatureOverlay>
    </Screen>
  );
}
