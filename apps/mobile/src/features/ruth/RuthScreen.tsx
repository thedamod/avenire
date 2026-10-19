import { Chat, useChat } from "@ai-sdk/react";
import {
  validateUIMessages,
  DefaultChatTransport,
  getToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import {
  call,
  conversationSession,
  loadConversation,
  questionAnswer,
} from "@avenire/client-runtime/rpc";
import * as WebBrowser from "expo-web-browser";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { type PageContext, RUTH_CHAT_PATH } from "@avenire/contracts";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";
import { apiUrl, getCookieHeader } from "../../state/auth";

type Part = RuthUIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` }>;

/** Streams over Expo's fetch, which supports response bodies as streams on device. */
const streamingFetch: typeof globalThis.fetch = (input, init) =>
  expoFetch(input instanceof Request ? input.url : input, {
    ...(init?.method === undefined ? {} : { method: init.method }),
    ...(init?.headers === undefined ? {} : { headers: init.headers }),
    ...(init?.body === undefined ? {} : { body: init.body }),
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });

/** One line per gated tool; inputs carry ids and titles, never the user's file names for moves. */
function describeApproval(part: ToolPart): string {
  const input: unknown = part.input;
  const fields = typeof input === "object" && input !== null ? input : {};
  const title = "title" in fields && typeof fields.title === "string" ? fields.title : undefined;
  switch (part.type) {
    case "tool-write_file":
      return `Create the note “${title ?? "untitled"}”.`;
    case "tool-move_file":
      return "Move a file into another folder.";
    case "tool-rename_file":
      return `Rename a file to “${title ?? "a new title"}”.`;
    case "tool-archive_file":
      return "Archive a file. You can restore it for 30 days.";
    default:
      return `Allow ${getToolName(part).replaceAll("_", " ")}.`;
  }
}

export function RuthScreen() {
  const api = useApi();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const [input, setInput] = useState(() => conversationSession<RuthUIMessage>(api).draft);
  const [error, setError] = useState<string>();
  const session = conversationSession<RuthUIMessage>(api);
  const [historyReady, setHistoryReady] = useState(session.ready);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const page = useRef<PageContext>(undefined);
  useEffect(() => {
    page.current = {
      surface: "chat",
      platform: "mobile",
      contentWidthPx: Math.round(width - 64),
      colorScheme: colorScheme === "dark" ? "dark" : "light",
      themeTokens: {},
      fonts: { body: "System", mono: "monospace" },
    };
  }, [width, colorScheme]);

  session.pageContext = () => page.current;

  const [transport] = useState(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: `${apiUrl}${RUTH_CHAT_PATH}`,
        fetch: streamingFetch,
        headers: getCookieHeader,
        // The server owns the history; send only the latest message.
        prepareSendMessagesRequest: ({ messages: current, headers }) => ({
          ...(headers === undefined ? {} : { headers }),
          body: {
            threadId: session.threadId,
            message: current.at(-1),
            page: session.pageContext?.(),
            fast: false,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      }),
  );
  const chat = session.retain(
    () =>
      new Chat<RuthUIMessage>({
        transport,
        messages: session.messages,
        sendAutomaticallyWhen: (options) =>
          lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
          lastAssistantMessageIsCompleteWithToolCalls(options),
      }),
    (retained) => {
      void retained.stop();
    },
  );
  const {
    messages,
    sendMessage,
    status,
    error: chatError,
    addToolApprovalResponse: approveTool,
    addToolOutput: outputTool,
  } = useChat({ chat });
  useEffect(() => {
    let active = true;
    void loadConversation(api, session, (saved) =>
      validateUIMessages<RuthUIMessage>({ messages: saved }),
    )
      .then(() => {
        if (!active) return;
        if (chat.messages.length === 0) chat.messages = session.messages;
        setHistoryReady(true);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [api, session, chat, historyAttempt]);
  useEffect(() => {
    session.messages = messages;
  }, [session, messages]);
  const addToolApprovalResponse: typeof approveTool = (response) =>
    session
      .respondOnce(`approval:${response.id}`, () => approveTool(response))
      .catch((cause: unknown) => setError(errorMessage(cause)));
  const addToolOutput: typeof outputTool = (response) =>
    session
      .respondOnce(`tool:${response.toolCallId}`, () => outputTool(response))
      .catch((cause: unknown) => setError(errorMessage(cause)));
  const working = status === "submitted" || status === "streaming";

  // Mobile has no WebView yet, so widgets and downloads open in the system browser.
  const openUrl = async (url: string) => {
    setError(undefined);
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || working || !historyReady) return;
    setInput("");
    session.draft = "";
    setError(undefined);
    try {
      await session.send(async () => {
        await session.ensureThread(async () => {
          const thread = await call(api, (client) =>
            client["ruth.createThread"]({ title: text.slice(0, 60) }),
          );
          return thread.id;
        });
        await sendMessage({ text: text });
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const toolView = (part: ToolPart, key: string) => {
    if (part.state === "approval-requested") {
      return (
        <View key={key} className="gap-2 rounded-xl border border-border bg-muted p-3">
          <Text className="font-semibold text-foreground">Approval required</Text>
          <Text className="text-sm text-muted-foreground">{describeApproval(part)}</Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                onPress={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
              >
                Approve
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="destructive"
                onPress={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
              >
                Decline
              </Button>
            </View>
          </View>
        </View>
      );
    }
    if (part.state === "output-denied") {
      return (
        <Text key={key} className="text-sm text-muted-foreground">
          Declined.
        </Text>
      );
    }
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return (
        <AskUserControl
          key={key}
          question={part.input.question}
          choices={part.input.choices ?? []}
          allowCustom={part.input.allowCustom ?? true}
          onAnswer={(answer) => {
            void addToolOutput(questionAnswer(part.toolCallId, answer));
          }}
        />
      );
    }
    if (part.type === "tool-render_widget" && part.state === "output-available") {
      return (
        <Button key={key} variant="secondary" onPress={() => void openUrl(part.output.url)}>
          {`Open ${part.output.title}`}
        </Button>
      );
    }
    if (part.type === "tool-publish_asset" && part.state === "output-available") {
      return (
        <View key={key} className="gap-2">
          {part.output.kind === "image" ? (
            <AssetImage url={part.output.url} title={part.output.name} />
          ) : null}
          <Button
            variant="secondary"
            onPress={() => void openUrl(part.output.url)}
          >{`Open ${part.output.name}`}</Button>
        </View>
      );
    }
    if (part.state === "output-error") {
      return (
        <Text key={key} className="text-xs text-destructive">
          {getToolName(part)} failed: {part.errorText}
        </Text>
      );
    }
    return (
      <Text key={key} className="text-xs text-muted-foreground">
        {getToolName(part).replaceAll("_", " ")}
        {part.state === "output-available" ? "" : "…"}
      </Text>
    );
  };

  const partView = (part: Part, key: string) => {
    if (isStaticToolUIPart(part)) return toolView(part, key);
    switch (part.type) {
      case "text":
        return (
          <Text key={key} className="text-foreground">
            {part.text}
          </Text>
        );
      case "data-subagent":
        return (
          <View key={key} className="rounded-xl bg-muted p-3">
            <Text className="text-sm text-foreground">
              Video agent: {part.data.stage ?? part.data.status}
            </Text>
          </View>
        );
      case "data-cloud-run":
        return (
          <View key={key} className="rounded-xl bg-muted p-3">
            <Text className="text-sm text-foreground">Ruth Cloud run started.</Text>
          </View>
        );
      default:
        return null;
    }
  };

  const last = messages.at(-1);

  return (
    <Screen
      title="Ask Ruth"
      subtitle="Ask questions grounded in your study library."
      scroll={false}
    >
      <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-3">
        {error || chatError ? (
          <ErrorState
            message={error ?? errorMessage(chatError)}
            {...(!historyReady
              ? {
                  onRetry: () => {
                    setError(undefined);
                    setHistoryAttempt((value) => value + 1);
                  },
                }
              : {})}
          />
        ) : null}
        {messages.length === 0 ? (
          <EmptyState
            title="Start a conversation"
            description="Ask Ruth to explain something you have studied."
          />
        ) : null}
        {messages.map((message) => (
          <Card key={message.id}>
            <View className="gap-3">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                {message.role === "user" ? "You" : "Ruth"}
              </Text>
              {message.parts.map((part, index) => partView(part, `${message.id}-${index}`))}
            </View>
          </Card>
        ))}
        {working && last?.role === "user" ? <ActivityIndicator /> : null}
      </ScrollView>
      <View className="flex-row items-end gap-2 border-t border-border bg-background pt-3">
        <TextInput
          multiline
          editable={!working}
          value={input}
          onChangeText={(value) => {
            setInput(value);
            session.draft = value;
          }}
          placeholder="Ask Ruth"
          className="max-h-28 min-h-12 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
        />
        <View className="w-20">
          <Button
            onPress={() => void send()}
            disabled={!historyReady || !input.trim()}
            busy={working}
          >
            Send
          </Button>
        </View>
      </View>
    </Screen>
  );
}

/** Native images can send the app session; the external browser still requires its own login. */
function AssetImage({ url, title }: { url: string; title: string }) {
  const [headers, setHeaders] = useState<Record<string, string>>();
  useEffect(() => {
    let active = true;
    void getCookieHeader().then((value) => {
      if (active) setHeaders(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return headers ? (
    <Image
      source={{ uri: url, headers }}
      accessibilityLabel={title}
      style={{ width: "100%", height: 280 }}
      resizeMode="contain"
    />
  ) : null;
}

function AskUserControl({
  question,
  choices,
  allowCustom,
  onAnswer,
}: {
  question: string;
  choices: readonly string[];
  allowCustom: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <View className="gap-2 rounded-xl border border-border bg-muted p-3">
      <Text className="font-semibold text-foreground">{question}</Text>
      {choices.map((choice) => (
        <Button key={choice} variant="secondary" onPress={() => onAnswer(choice)}>
          {choice}
        </Button>
      ))}
      {allowCustom ? (
        <>
          <TextInput
            accessibilityLabel="Your answer"
            value={custom}
            onChangeText={setCustom}
            className="min-h-12 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
          />
          <Button disabled={!custom.trim()} onPress={() => onAnswer(custom.trim())}>
            Answer
          </Button>
        </>
      ) : null}
    </View>
  );
}
