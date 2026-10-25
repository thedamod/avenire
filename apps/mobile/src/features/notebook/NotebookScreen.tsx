import { FeatureHeader as GlassHeader, FeatureErrorState as ErrorState } from "./FeatureUi";
import { Fragment, useState } from "react";
import { ScrollView, View } from "react-native";
import type { FolderColor, FolderCover, LibraryFile } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import {
  Button,
  Composer,
  Divider,
  EmptyState,
  FileIcon,
  Input,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { useSourceActions, fileIconType, sourceHost } from "../sources/data";
import { CoverPicker, NotebookPreview } from "./CoverPicker";
import { FeatureOverlay } from "./FeatureOverlay";
import { plural, relativeTime, useNotebook, useNotebookActions } from "./data";

function NoteRow({ file, onPress }: { file: LibraryFile; onPress: () => void }) {
  const by =
    file.source === "ruth-cloud" || file.source === "ruth"
      ? "Written by Ruth"
      : file.source === "chat"
        ? "Saved from a chat"
        : "Your note";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open note ${file.title}`}
      onPress={onPress}
      style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 4 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: "600" }}>
          {file.title}
        </Text>
        <Text variant="meta">{relativeTime(file.updatedAt)}</Text>
      </View>
      {file.preview ? (
        <Text numberOfLines={2} style={{ color: "#A3A3A3", fontSize: 14, lineHeight: 20 }}>
          {file.preview}
        </Text>
      ) : null}
      <Text variant="meta" color={by === "Written by Ruth" ? "accent-text" : "fg-3"}>
        {by}
      </Text>
    </Pressable>
  );
}

export function NotebookScreen(props: ScreenProps<"Notebook">) {
  return <NotebookPage key={props.route.params.folderId} {...props} />;
}

function NotebookPage({ route, navigation }: ScreenProps<"Notebook">) {
  const { folderId } = route.params;
  const notebook = useNotebook(folderId);
  const actions = useNotebookActions();
  const sourceActions = useSourceActions();
  const [menu, setMenu] = useState<"actions" | "rename" | "cover" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<FolderColor>("blue");
  const [cover, setCover] = useState<FolderCover>("cradle");
  const [question, setQuestion] = useState("");
  const [allSources, setAllSources] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const folder = notebook.folder;
  const notes = notebook.notes;
  const sources = notebook.sources;
  function edit(kind: "rename" | "cover") {
    if (!folder) return;
    setName(folder.name);
    setColor(folder.color);
    setCover(folder.cover);
    setMenu(kind);
  }
  async function save() {
    const updated = await actions.update(
      folderId,
      menu === "rename" ? { name: name.trim() } : { color, cover },
    );
    if (updated) {
      setMenu(null);
      notebook.refetch();
    }
  }
  async function createNote() {
    const note = await actions.createNote([folderId]);
    if (note) navigation.push("Note", { fileId: note.id });
  }
  async function ask(text: string) {
    const thread = await sourceActions.ask(text, [], folderId);
    if (thread) {
      setQuestion("");
      navigation.push("Chat", { threadId: thread.id, q: text });
    }
  }
  return (
    <Screen edges={["top", "left", "right"]}>
      <GlassHeader
        title=""
        onBack={() => navigation.goBack()}
        trailing={[
          {
            icon: "search",
            accessibilityLabel: "Search notebook",
            onPress: () =>
              navigation.navigate("Ask", { q: folder ? `Search ${folder.name}: ` : "" }),
          },
          {
            icon: "more",
            accessibilityLabel: "Notebook actions",
            disabled: !folder,
            onPress: () => setMenu("actions"),
          },
        ]}
      />
      <ScrollFade top={scrolled}>
        <ScrollView
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 150 }}
        >
          {notebook.error ? (
            <View style={{ padding: 20 }}>
              <ErrorState message={errorMessage(notebook.error)} onRetry={notebook.refetch} />
            </View>
          ) : null}
          {!folder && notebook.loading ? (
            <View style={{ padding: 20 }}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : folder ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 16,
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 4,
              }}
            >
              <NotebookPreview
                name="Change cover"
                color={folder.color}
                cover={folder.cover}
                compact
                onPress={() => edit("cover")}
              />
              <View style={{ flex: 1, gap: 4, paddingBottom: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Rename notebook"
                  onPress={() => edit("rename")}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text
                    style={{
                      fontSize: 26,
                      lineHeight: 32,
                      fontWeight: "600",
                      letterSpacing: -0.52,
                    }}
                  >
                    {folder.name}
                  </Text>
                </Pressable>
                <Text style={{ color: "#6E6E6E", fontSize: 13, lineHeight: 18 }}>
                  {plural(notes?.length ?? folder.noteCount, "note")} ·{" "}
                  {plural(sources?.length ?? folder.sourceCount, "source")} · edited{" "}
                  {relativeTime(folder.updatedAt).toLowerCase()}
                </Text>
              </View>
            </View>
          ) : null}
          <View
            style={{
              paddingTop: 22,
              paddingBottom: 4,
              paddingLeft: 20,
              paddingRight: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text variant="section">
              Notes{" "}
              <Text color="fg-3" style={{ fontSize: 13 }}>
                {notes?.length ?? folder?.noteCount ?? ""}
              </Text>
            </Text>
            <Button
              accessibilityLabel="Create a note in this notebook"
              variant="secondary"
              icon="plus"
              hitSlop={6}
              disabled={!folder}
              busy={actions.busy}
              onPress={() => void createNote()}
            >
              New note
            </Button>
          </View>
          {!notes && notebook.loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : notes?.length ? (
            notes.map((file, index) => (
              <Fragment key={file.id}>
                {index ? <Divider /> : null}
                <NoteRow file={file} onPress={() => navigation.push("Note", { fileId: file.id })} />
              </Fragment>
            ))
          ) : !notebook.error ? (
            <EmptyState title="No notes yet" description="Write a note or save one from a chat." />
          ) : null}
          <View
            style={{
              paddingTop: 20,
              paddingBottom: 10,
              paddingHorizontal: 20,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Text variant="section">Sources · {sources?.length ?? folder?.sourceCount ?? 0}</Text>
            <Button
              accessibilityLabel={allSources ? "Show source preview" : "View all notebook sources"}
              variant="link"
              hitSlop={6}
              onPress={() => setAllSources(!allSources)}
            >
              {allSources ? "Show less" : "View all"}
            </Button>
          </View>
          {!sources && notebook.loading ? (
            <SkeletonRow />
          ) : !sources?.length ? (
            <EmptyState title="No sources yet" description="Move sources here from your library." />
          ) : allSources ? (
            sources.map((file) => (
              <Pressable
                key={file.id}
                accessibilityRole="button"
                accessibilityLabel={`Open source ${file.title}`}
                onPress={() => navigation.navigate("Citation", { sourceId: file.id })}
                style={{
                  minHeight: 56,
                  paddingHorizontal: 20,
                  paddingVertical: 11,
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <FileIcon
                  type={fileIconType(file)}
                  {...(file.sourceUrl ? { url: file.sourceUrl } : {})}
                />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{file.title}</Text>
                  <Text variant="meta">{sourceHost(file)}</Text>
                </View>
              </Pressable>
            ))
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
            >
              {sources.map((file) => (
                <Pressable
                  key={file.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open source ${file.title}`}
                  onPress={() => navigation.navigate("Citation", { sourceId: file.id })}
                  style={{
                    width: 150,
                    height: 118,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#222222",
                    backgroundColor: "#111111",
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <FileIcon
                    type={fileIconType(file)}
                    {...(file.sourceUrl ? { url: file.sourceUrl } : {})}
                  />
                  <Text
                    numberOfLines={2}
                    style={{ fontSize: 14, lineHeight: 18, fontWeight: "500" }}
                  >
                    {file.title}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text variant="meta" numberOfLines={1}>
                    {sourceHost(file)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {actions.error || sourceActions.error ? (
            <View style={{ padding: 20 }}>
              <ErrorState message={errorMessage(actions.error ?? sourceActions.error)} />
            </View>
          ) : null}
        </ScrollView>
      </ScrollFade>
      <Composer
        value={question}
        onChangeText={setQuestion}
        onSend={(text) => void ask(text)}
        placeholder="Search this notebook or ask"
        sending={sourceActions.busy}
        controls={[
          { key: "ruth", icon: "moon", label: "Ruth" },
          { key: "notebook", icon: "folder", label: folder?.name ?? "This notebook" },
        ]}
      />
      <FeatureOverlay
        visible={menu !== null}
        title={
          menu === "rename"
            ? "Rename notebook"
            : menu === "cover"
              ? "Change cover"
              : menu === "delete"
                ? "Delete notebook"
                : "Notebook actions"
        }
        onClose={() => setMenu(null)}
      >
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {menu === "actions" ? (
            <>
              {(
                [
                  ["Rename", "rename"],
                  ["Change cover", "cover"],
                ] as const
              ).map(([label, kind]) => (
                <Button
                  key={kind}
                  accessibilityLabel={label}
                  variant="ghost"
                  style={{ height: 44, justifyContent: "flex-start" }}
                  onPress={() => edit(kind)}
                >
                  {label}
                </Button>
              ))}
              <Button
                accessibilityLabel="Delete notebook"
                variant="ghost"
                style={{ height: 44, justifyContent: "flex-start" }}
                onPress={() => setMenu("delete")}
              >
                <Text color="red">Delete notebook</Text>
              </Button>
            </>
          ) : null}
          {menu === "rename" ? (
            <Input
              label="Name"
              accessibilityLabel="Notebook name"
              autoFocus
              maxLength={120}
              value={name}
              onChangeText={setName}
              style={{ height: 44 }}
            />
          ) : null}
          {menu === "cover" ? (
            <CoverPicker color={color} cover={cover} onColor={setColor} onCover={setCover} />
          ) : null}
          {menu === "delete" ? (
            <>
              <Text>
                Notes and sources only in this notebook move to Trash with it. Files also in other
                active notebooks stay in your library. You can restore them for 30 days.
              </Text>
              <Button
                accessibilityLabel="Move notebook to Trash"
                variant="destructive"
                style={{ height: 44 }}
                busy={actions.busy}
                onPress={() => {
                  void actions.trash(folderId).then((ok) => {
                    if (ok) {
                      setMenu(null);
                      navigation.goBack();
                    }
                  });
                }}
              >
                Move to Trash
              </Button>
            </>
          ) : null}
          {menu === "rename" || menu === "cover" ? (
            <Button
              accessibilityLabel="Save notebook changes"
              busy={actions.busy}
              disabled={menu === "rename" && !name.trim()}
              style={{ height: 44 }}
              onPress={() => void save()}
            >
              Save
            </Button>
          ) : null}
          {actions.error ? <ErrorState message={errorMessage(actions.error)} /> : null}
        </View>
      </FeatureOverlay>
    </Screen>
  );
}
