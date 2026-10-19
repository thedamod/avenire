import { useChat } from "@ai-sdk/react";
import {
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
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { call } from "@avenire/client-runtime/rpc";
import * as WebBrowser from "expo-web-browser";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { type PageContext, RUTH_CHAT_PATH, type ThreadId } from "@avenire/contracts";
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
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>();
  const threadId = useRef<ThreadId>(undefined);
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
            threadId: threadId.current,
            message: current.at(-1),
            page: page.current,
            fast: false,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      }),
  );
  const { messages, sendMessage, status, addToolApprovalResponse, addToolOutput } =
    useChat<RuthUIMessage>({
      transport,
      sendAutomaticallyWhen: (options) =>
        lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
        lastAssistantMessageIsCompleteWithToolCalls(options),
      onError: (cause) => setError(errorMessage(cause)),
    });
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
    if (!text || working) return;
    setInput("");
    setError(undefined);
    try {
      if (threadId.current === undefined) {
        const thread = await call(api, (client) =>
          client["ruth.createThread"]({ title: text.slice(0, 60) }),
        );
        threadId.current = thread.id;
      }
      await sendMessage({ text });
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
        <View key={key} className="gap-2 rounded-xl border border-border bg-muted p-3">
          <Text className="font-semibold text-foreground">{part.input.question}</Text>
          {(part.input.choices ?? []).map((choice) => (
            <Button
              key={choice}
              variant="secondary"
              onPress={() =>
                addToolOutput({
                  tool: "ask_user",
                  toolCallId: part.toolCallId,
                  output: { answers: [choice] },
                })
              }
            >
              {choice}
            </Button>
          ))}
        </View>
      );
    }
    if (part.type === "tool-render_widget" && part.state === "output-available") {
      return (
        <Button key={key} variant="secondary" onPress={() => void openUrl(part.output.url)}>
          {`Open ${part.output.title}`}
        </Button>
      );
    }
    if (part.type === "tool-sandbox_download_artifact" && part.state === "output-available") {
      return (
        <Button key={key} variant="secondary" onPress={() => void openUrl(part.output.url)}>
          {`Download ${part.output.name}`}
        </Button>
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
        {error ? <ErrorState message={error} /> : null}
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
          onChangeText={setInput}
          placeholder="Ask Ruth"
          className="max-h-28 min-h-12 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
        />
        <View className="w-20">
          <Button onPress={() => void send()} disabled={!input.trim()} busy={working}>
            Send
          </Button>
        </View>
      </View>
    </Screen>
  );
}
