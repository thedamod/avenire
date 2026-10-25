import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import type { FileId, Folder, FolderId } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  GlassHeader,
  Icon,
  IconButton,
  Markdown,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { useHomeLibrary, coverColors } from "../home/data";
import { FeatureOverlay } from "../home/FeatureOverlay";
import { SourceIcon } from "../home/SourcesTab";
import { AskComposer } from "./AskComposer";
import {
  answerMarkdown,
  citedSources,
  citationLabel,
  collectCitations,
  record,
  stripCitations,
} from "./citations";
import { searchKey, useAskSession } from "./data";
import { SaveToNotebook } from "./SaveToNotebook";
import { SearchResults } from "./SearchResults";

export function AskScreen({ navigation, route }: ScreenProps<"Ask">) {
  const initial = route.params?.q?.trim() ?? "";
  const library = useHomeLibrary();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [lastQuestion, setLastQuestion] = useState(initial);
  const [scope, setScope] = useState<FolderId | null>(null);
  const [context, setContext] = useState<FileId[]>([]);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState<number>();
  const [picker, setPicker] = useState<"scope" | "context" | null>(null);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ label: string; fileId?: FileId }>();
  const [actionError, setActionError] = useState<unknown>();
  const [workExpanded, setWorkExpanded] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const chat = useAskSession(scope, context);
  const send = chat.send;
  const started = useRef(false);
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      void send(initial);
    }
  }, [initial, send]);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    if (!chat.startedAt) return;
    const update = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor(
            ((chat.finishedAt ?? Date.now()) - chat.startedAt!) / 1000,
          ),
        ),
      );
    update();
    if (chat.finishedAt) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [chat.startedAt, chat.finishedAt]);
  const searching = !lastQuestion;
  useEffect(() => {
    if (!searching) return;
    if (draft.trim() === query) return;
    setCount(undefined);
    const timer = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft, searching]);
  const lastUser = chat.messages.findLast((message) => message.role === "user");
  const question =
    lastUser?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim() || lastQuestion;
  const latest = chat.messages.at(-1);
  const reply = latest?.role === "assistant" ? latest : undefined;
  const raw =
    reply?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n") ?? "";
  const citationMap = useMemo(
    () => collectCitations(chat.messages),
    [chat.messages],
  );
  const answer = useMemo(
    () => stripCitations(raw, citationMap),
    [raw, citationMap],
  );
  const citations = useMemo(
    () => citedSources(raw, citationMap),
    [raw, citationMap],
  );
  const markdown = answerMarkdown(answer, citations);
  const done = !chat.busy && Boolean(answer);
  const selectedFolder = scope ? library.folderById.get(scope) : undefined;
  const work = useMemo(() => {
    return (reply?.parts ?? []).flatMap((part) => {
      const tool = record(part);
      if (
        !tool ||
        typeof tool.type !== "string" ||
        (!tool.type.startsWith("tool-") && tool.type !== "dynamic-tool")
      )
        return [];
      const name =
        tool.type === "dynamic-tool"
          ? String(tool.toolName)
          : tool.type.slice(5);
      if (name === "ask_user") return [];
      const output = record(tool.output);
      const hits = output?.hits;
      const input = record(tool.input);
      const file =
        typeof input?.fileId === "string"
          ? library.files?.find((entry) => entry.id === input.fileId)
          : undefined;
      const success = tool.state === "output-available";
      const error = tool.state === "output-error";
      const label =
        name === "search_materials"
          ? success && Array.isArray(hits)
            ? `Searched ${new Set(hits.map((hit) => record(hit)?.fileId)).size} files across your notebooks`
            : "Searching your notebooks"
          : name === "read_file"
            ? `Reading ${file?.title ?? "your source"}`
            : name
                .replace(/_/g, " ")
                .replace(/^./, (letter) => letter.toUpperCase());
      return [
        {
          key: String(tool.toolCallId),
          icon:
            name === "search_materials"
              ? ("search" as const)
              : ("doc" as const),
          label: error ? `${label} · couldn't finish` : label,
          success,
          error,
        },
      ];
    });
  }, [reply, library.files]);
  const needsYou = (reply?.parts ?? []).some((part) => {
    const tool = record(part);
    return (
      tool?.state === "approval-requested" ||
      ((tool?.type === "tool-ask_user" || tool?.toolName === "ask_user") &&
        tool.state === "input-available")
    );
  });
  const ask = async () => {
    const text = draft.trim();
    if (!text || chat.busy) return;
    Keyboard.dismiss();
    setLastQuestion(text);
    setDraft("");
    setNotice(undefined);
    setActionError(undefined);
    setWorkExpanded(false);
    nearBottom.current = true;
    await send(text);
  };
  const search = () => {
    if (draft.trim() !== query) setCount(undefined);
    setQuery(draft.trim());
    Keyboard.dismiss();
  };
  const onCount = useCallback(
    (value: number | undefined) => setCount(value),
    [],
  );
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(markdown);
      setNotice({ label: "Copied" });
    } catch (cause) {
      setActionError(cause);
    }
  };
  const openChat = () => {
    if (chat.threadId) {
      Keyboard.dismiss();
      navigation.navigate("Chat", { threadId: chat.threadId });
    }
  };
  const paragraphs = answer.split(/\n\n/);
  const firstParagraph = paragraphs[0] ?? "";
  const rest = paragraphs.slice(1).join("\n\n");
  return (
    <Screen edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {searching ? (
          <View style={styles.searchHeader}>
            <Text style={{ fontSize: 13, lineHeight: 18, color: "#6E6E6E" }}>
              {query
                ? count === undefined
                  ? "Searching…"
                  : `${count} matching ${count === 1 ? "file" : "files"}`
                : "Search your files"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel search and return Home"
              onPress={() => navigation.goBack()}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "500",
                  color: "#EDEDED",
                }}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <GlassHeader
            title={question}
            subtitle={selectedFolder?.name ?? "All notebooks"}
            onBack={() => navigation.goBack()}
            trailing={[
              {
                icon: "more",
                hitSlop: 2,
                accessibilityLabel: "Answer actions",
                onPress: () => setMenu(true),
              },
            ]}
          />
        )}
        <ScrollFade top={scrolled}>
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: searching ? 20 : 90 }}
            scrollEventThrottle={32}
            onScroll={({ nativeEvent }) => {
              setScrolled(nativeEvent.contentOffset.y > 0);
              nearBottom.current =
                nativeEvent.contentSize.height -
                  nativeEvent.layoutMeasurement.height -
                  nativeEvent.contentOffset.y <
                80;
            }}
            onContentSizeChange={() => {
              if (chat.busy && nearBottom.current)
                scroll.current?.scrollToEnd({ animated: false });
            }}
          >
            {searching ? (
              query ? (
                <SearchResults
                  key={searchKey(query, scope, context)}
                  query={query}
                  folderId={scope}
                  fileIds={context}
                  files={library.files}
                  navigation={navigation}
                  onCount={onCount}
                />
              ) : (
                <EmptyState
                  title="Search or ask Ruth"
                  description="Find a passage in your material, or ask for an explanation."
                />
              )
            ) : (
              <View style={styles.answer}>
                <View style={{ alignItems: "flex-end", paddingLeft: 48 }}>
                  <View style={styles.bubble}>
                    <Text
                      style={{ color: "#EDEDED", fontSize: 15, lineHeight: 21 }}
                    >
                      {question}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${workExpanded ? "Hide" : "Show"} Ruth's work, ${elapsed} seconds`}
                  accessibilityState={{ expanded: workExpanded }}
                  onPress={() => setWorkExpanded((value) => !value)}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: "#222222",
                  }}
                >
                  <Text style={{ fontSize: 14, lineHeight: 18 }}>
                    {chat.busy ? "Working" : "Worked"} for {elapsed}s
                  </Text>
                  <Icon
                    name={workExpanded ? "chevD" : "chevR"}
                    size={12}
                    color="#6E6E6E"
                  />
                </Pressable>
                {(chat.busy || workExpanded) && work.length ? (
                  <View>
                    {work.map((entry) => (
                      <View
                        key={entry.key}
                        style={{
                          minHeight: 30,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Icon
                          name={entry.icon}
                          size={14}
                          color={
                            entry.error
                              ? "#FF6B6B"
                              : entry.icon === "doc"
                                ? "#C2D4FF"
                                : "#6E6E6E"
                          }
                        />
                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>
                          {entry.label}
                        </Text>
                        {entry.success ? (
                          <Icon name="chevR" size={12} color="#6E6E6E" />
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {answer ? (
                  <View>
                    <Markdown value={firstParagraph} />
                    {citations.length ? (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: 14,
                        }}
                      >
                        {citations.map((citation) => {
                          const file = library.files?.find(
                            (entry) => entry.id === citation.fileId,
                          );
                          return (
                            <Pressable
                              key={`${citation.fileId}:${citation.page}:${citation.time}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Open cited source: ${citationLabel(citation)}`}
                              hitSlop={{ top: 7, bottom: 7 }}
                              onPress={() =>
                                navigation.navigate("Citation", {
                                  sourceId: citation.fileId,
                                  ...(citation.page !== undefined
                                    ? { page: citation.page }
                                    : {}),
                                  ...(citation.time !== undefined
                                    ? { time: citation.time }
                                    : {}),
                                })
                              }
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                height: 30,
                                paddingHorizontal: 10,
                                borderRadius: 7,
                                borderWidth: 1,
                                borderColor: "#2E2E2E",
                              }}
                            >
                              <SourceIcon
                                file={
                                  file ?? {
                                    kind:
                                      citation.time !== undefined
                                        ? "video"
                                        : "pdf",
                                    sourceUrl: null,
                                  }
                                }
                                size={14}
                              />
                              <Text
                                style={{
                                  color: "#EDEDED",
                                  fontSize: 13,
                                  lineHeight: 16,
                                }}
                              >
                                {citationLabel(citation)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    {rest ? (
                      <View style={{ opacity: chat.busy ? 0.55 : 1 }}>
                        <Markdown value={rest} />
                      </View>
                    ) : null}
                  </View>
                ) : chat.busy ? (
                  <SkeletonRow />
                ) : null}
                {chat.error ? (
                  <ErrorState
                    message={errorMessage(chat.error)}
                    onRetry={() => {
                      if (lastUser) void chat.regenerate();
                      else void send(lastQuestion);
                    }}
                  />
                ) : null}
                {needsYou && !chat.busy ? (
                  <View style={{ gap: 6 }}>
                    <Text>Ruth needs your answer to continue.</Text>
                    <Button
                      variant="link"
                      accessibilityLabel="Continue this conversation in chat"
                      hitSlop={6}
                      onPress={openChat}
                    >
                      Open in chat
                    </Button>
                  </View>
                ) : null}
                {done ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flexWrap: "wrap",
                      columnGap: 18,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Save answer to a notebook"
                      onPress={() => setSaving(true)}
                      style={styles.textAction}
                    >
                      <Icon name="save" color="#C2D4FF" size={15} />
                      <Text
                        style={{
                          fontSize: 14,
                          lineHeight: 18,
                          fontWeight: "500",
                          color: "#C2D4FF",
                        }}
                      >
                        Save to notebook
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Copy answer with citations"
                      onPress={() => void copy()}
                      style={styles.textAction}
                    >
                      <Icon name="copy" size={15} />
                      <Text style={{ fontSize: 14, lineHeight: 18 }}>Copy</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open this thread in chat"
                      onPress={openChat}
                      style={styles.textAction}
                    >
                      <Text style={{ fontSize: 14, lineHeight: 18 }}>
                        Open in chat
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {notice ? (
                  <Pressable
                    accessibilityRole={notice.fileId ? "button" : "text"}
                    accessibilityLabel={
                      notice.fileId
                        ? `${notice.label}. Open saved note`
                        : notice.label
                    }
                    onPress={
                      notice.fileId
                        ? () =>
                            navigation.navigate("Note", {
                              fileId: notice.fileId!,
                            })
                        : undefined
                    }
                    style={{ minHeight: 44, justifyContent: "center" }}
                  >
                    <Text accessibilityLiveRegion="polite" color="accent-text">
                      {notice.label}
                      {notice.fileId ? " · Open note" : ""}
                    </Text>
                  </Pressable>
                ) : null}
                {actionError ? (
                  <ErrorState message={errorMessage(actionError)} />
                ) : null}
              </View>
            )}
          </ScrollView>
        </ScrollFade>
        {!searching && chat.busy ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              paddingBottom: 14,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Stop Ruth, working for ${elapsed} seconds`}
              onPress={() => void chat.stop()}
              hitSlop={3}
              style={styles.working}
            >
              <Icon name="spinner" color="#ABC4FF" size={14} />
              <Text variant="label" color="fg">
                Working {elapsed}s
              </Text>
              <View
                style={{ width: 1, height: 14, backgroundColor: "#2E2E2E" }}
              />
              <Text style={{ fontSize: 13 }}>Stop</Text>
            </Pressable>
            <IconButton
              icon="chevD"
              size={38}
              hitSlop={3}
              accessibilityLabel="Scroll to latest answer"
              onPress={() => scroll.current?.scrollToEnd({ animated: false })}
              style={styles.down}
            />
          </View>
        ) : null}
        <View
          style={{
            paddingTop: 10,
            paddingHorizontal: 12,
            paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 30),
          }}
        >
          <LinearGradient
            pointerEvents="none"
            colors={["#0B0B0B00", "#0B0B0B"]}
            style={StyleSheet.absoluteFill}
          />
          <AskComposer
            value={draft}
            onChangeText={setDraft}
            onAsk={() => void ask()}
            onSearch={search}
            onScope={() => {
              Keyboard.dismiss();
              setPicker("scope");
            }}
            onContext={() => {
              Keyboard.dismiss();
              setPicker("context");
            }}
            scopeLabel={selectedFolder?.name ?? "All notebooks"}
            contextCount={context.length}
            searching={searching}
            busy={chat.busy}
            autoFocus={!initial}
          />
        </View>
      </KeyboardAvoidingView>
      <FeatureOverlay
        open={menu}
        onClose={() => setMenu(false)}
        label="Answer actions"
        menu
      >
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="Open in chat"
          disabled={!chat.threadId || chat.busy}
          onPress={() => {
            setMenu(false);
            openChat();
          }}
          style={styles.menuItem}
        >
          <Icon name="chat" />
          <Text color="fg">Open in chat</Text>
        </Pressable>
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="Save to notebook"
          disabled={!done}
          onPress={() => {
            setMenu(false);
            setSaving(true);
          }}
          style={styles.menuItem}
        >
          <Icon name="save" />
          <Text color="fg">Save to notebook</Text>
        </Pressable>
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel="Copy answer"
          disabled={!answer}
          onPress={() => {
            setMenu(false);
            void copy();
          }}
          style={styles.menuItem}
        >
          <Icon name="copy" />
          <Text color="fg">Copy</Text>
        </Pressable>
      </FeatureOverlay>
      <FeatureOverlay
        open={picker !== null}
        onClose={() => setPicker(null)}
        label={picker === "scope" ? "Choose notebook" : "Add context"}
      >
        <Text
          variant="heading"
          style={{ paddingHorizontal: 20, paddingVertical: 12 }}
        >
          {picker === "scope" ? "Search in" : "Include sources and notes"}
        </Text>
        {library.error ? (
          <View style={{ padding: 20 }}>
            <ErrorState
              message={errorMessage(library.error)}
              onRetry={library.refetch}
            />
          </View>
        ) : null}
        <ScrollFade
          color="#131313"
          top={false}
          style={{ flex: 0, flexShrink: 1, maxHeight: 360 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
          >
            {picker === "scope" ? (
              <>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel="All notebooks"
                  accessibilityState={{ checked: scope === null }}
                  onPress={() => {
                    setScope(null);
                    setPicker(null);
                  }}
                  style={styles.menuItem}
                >
                  <Icon name="folder" />
                  <Text style={{ flex: 1 }} color="fg">
                    All notebooks
                  </Text>
                  {scope === null ? (
                    <Icon name="check" color="#ABC4FF" />
                  ) : null}
                </Pressable>
                {library.folders?.map((folder) => (
                  <Pressable
                    key={folder.id}
                    accessibilityRole="radio"
                    accessibilityLabel={folder.name}
                    accessibilityState={{ checked: scope === folder.id }}
                    onPress={() => {
                      setScope(folder.id);
                      setPicker(null);
                    }}
                    style={styles.menuItem}
                  >
                    <View
                      style={{
                        width: 10,
                        height: 13,
                        borderRadius: 1,
                        backgroundColor: coverColors[folder.color],
                      }}
                    />
                    <Text numberOfLines={1} style={{ flex: 1 }} color="fg">
                      {folder.name}
                    </Text>
                    {scope === folder.id ? (
                      <Icon name="check" color="#ABC4FF" />
                    ) : null}
                  </Pressable>
                ))}
              </>
            ) : library.files === undefined && !library.error ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : !library.files?.length && !library.error ? (
              <EmptyState
                title="No files yet."
                description="Capture material on your computer to include it here."
              />
            ) : (
              library.files?.map((file) => (
                <View key={file.id}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={file.title}
                    accessibilityState={{ checked: context.includes(file.id) }}
                    onPress={() =>
                      setContext((before) =>
                        before.includes(file.id)
                          ? before.filter((id) => id !== file.id)
                          : before.length < 200
                            ? [...before, file.id]
                            : before,
                      )
                    }
                    style={styles.menuItem}
                  >
                    <SourceIcon file={file} />
                    <Text numberOfLines={1} style={{ flex: 1 }} color="fg">
                      {file.title}
                    </Text>
                    {context.includes(file.id) ? (
                      <Icon name="check" color="#ABC4FF" />
                    ) : null}
                  </Pressable>
                  <Divider />
                </View>
              ))
            )}
          </ScrollView>
        </ScrollFade>
        {picker === "context" ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
            <Button
              accessibilityLabel="Finish choosing context"
              onPress={() => setPicker(null)}
              style={{ height: 44 }}
            >
              Done
            </Button>
          </View>
        ) : null}
      </FeatureOverlay>
      <SaveToNotebook
        open={saving}
        onClose={() => setSaving(false)}
        folders={library.folders ?? []}
        guess={scope}
        title={question}
        markdown={markdown}
        onSaved={(fileId, folder: Folder) =>
          setNotice({ label: `Saved to ${folder.name}`, fileId })
        }
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  searchHeader: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  answer: { paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  bubble: {
    backgroundColor: "#FFFFFF0F",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  textAction: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  working: {
    height: 38,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#FFFFFF14",
    backgroundColor: "#1E1E1ECC",
  },
  down: {
    borderWidth: 1,
    borderColor: "#FFFFFF14",
    backgroundColor: "#1E1E1ECC",
  },
  menuItem: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
