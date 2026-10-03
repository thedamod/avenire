import { useEffect, useReducer, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { call, stream } from "@avenire/client-runtime/rpc";
import * as WebBrowser from "expo-web-browser";
import type {
  Approval,
  ApprovalDecision,
  ApprovalId,
  ArtifactId,
  Message,
  MessagePart,
} from "@avenire/contracts";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, errorMessage } from "../../components/ErrorState";
import { Screen } from "../../components/Screen";
import { useApi } from "../../state/api";
import { initialRuthState, ruthReducer } from "./ruthReducer";

interface MessagePartProps {
  readonly approvals: ReadonlyMap<ApprovalId, Approval>;
  readonly onOpenArtifact: (artifactId: ArtifactId) => void;
  readonly onDecide: (approvalId: ApprovalId, decision: ApprovalDecision) => void;
  readonly deciding: ApprovalId | undefined;
}

function TextPart({ part }: { readonly part: Extract<MessagePart, { _tag: "text" }> }) {
  return (
    <View className="gap-2">
      <Text className="text-foreground">{part.text}</Text>
      {part.citations.length > 0 ? (
        <Text className="text-xs text-muted-foreground">
          Sources: {part.citations.map((citation) => citation.label).join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

function WidgetPart({ part }: { readonly part: Extract<MessagePart, { _tag: "widget" }> }) {
  return (
    <View className="gap-1 rounded-xl bg-muted p-3">
      <Text className="font-semibold text-foreground">{part.title}</Text>
      <Text className="text-sm text-muted-foreground">Open on desktop to use this widget.</Text>
    </View>
  );
}

function PlotPart({
  part,
  onOpenArtifact,
}: {
  readonly part: Extract<MessagePart, { _tag: "plot" }>;
  readonly onOpenArtifact: MessagePartProps["onOpenArtifact"];
}) {
  return (
    <View className="gap-2 rounded-xl bg-muted p-3">
      <Text className="text-foreground">{part.alt}</Text>
      <Button onPress={() => onOpenArtifact(part.artifactId)} variant="secondary">
        Open plot
      </Button>
    </View>
  );
}

function VideoPart({
  part,
  onOpenArtifact,
}: {
  readonly part: Extract<MessagePart, { _tag: "video" }>;
  readonly onOpenArtifact: MessagePartProps["onOpenArtifact"];
}) {
  return (
    <View className="gap-2 rounded-xl bg-muted p-3">
      <Text className="font-medium text-foreground">{part.title}</Text>
      <Button onPress={() => onOpenArtifact(part.artifactId)} variant="secondary">
        Open video
      </Button>
    </View>
  );
}

function CodePart({ part }: { readonly part: Extract<MessagePart, { _tag: "code" }> }) {
  return (
    <View className="gap-2 rounded-xl bg-muted p-3">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">Python</Text>
      <Text selectable className="font-mono text-sm text-foreground">
        {part.source}
      </Text>
      {part.stdout ? (
        <Text selectable className="font-mono text-sm text-muted-foreground">
          {part.stdout}
        </Text>
      ) : null}
    </View>
  );
}

function ApprovalPart({
  part,
  approvals,
  onDecide,
  deciding,
}: {
  readonly part: Extract<MessagePart, { _tag: "approval" }>;
  readonly approvals: MessagePartProps["approvals"];
  readonly onDecide: MessagePartProps["onDecide"];
  readonly deciding: MessagePartProps["deciding"];
}) {
  const approval = approvals.get(part.approvalId);
  return (
    <View className="gap-2 rounded-xl border border-border bg-muted p-3">
      <Text className="font-semibold text-foreground">Approval required</Text>
      <Text className="text-sm text-muted-foreground">
        {approval ? describeApproval(approval) : "Review this action."}
      </Text>
      {approval?.status === "pending" ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              onPress={() => onDecide(part.approvalId, "approved")}
              busy={deciding === part.approvalId}
            >
              Approve
            </Button>
          </View>
          <View className="flex-1">
            <Button
              onPress={() => onDecide(part.approvalId, "rejected")}
              variant="destructive"
              busy={deciding === part.approvalId}
            >
              Reject
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MessagePartView({ part, ...props }: MessagePartProps & { readonly part: MessagePart }) {
  switch (part._tag) {
    case "text":
      return <TextPart part={part} />;
    case "widget":
      return <WidgetPart part={part} />;
    case "plot":
      return <PlotPart part={part} onOpenArtifact={props.onOpenArtifact} />;
    case "video":
      return <VideoPart part={part} onOpenArtifact={props.onOpenArtifact} />;
    case "code":
      return <CodePart part={part} />;
    case "approval":
      return (
        <ApprovalPart
          part={part}
          approvals={props.approvals}
          onDecide={props.onDecide}
          deciding={props.deciding}
        />
      );
  }
}

function describeApproval(approval: Approval): string {
  switch (approval.action._tag) {
    case "move":
      return "Move a library item into another cluster.";
    case "rename":
      return `Rename an item to “${approval.action.title}”.`;
    case "delete":
      return "Delete a library item.";
    case "create-note":
      return `Create the note “${approval.action.title}”.`;
  }
}

function ChatMessage({
  message,
  approvals,
  onOpenArtifact,
  onDecide,
  deciding,
}: {
  readonly message: Message;
  readonly approvals: ReadonlyMap<ApprovalId, Approval>;
  readonly onOpenArtifact: (artifactId: ArtifactId) => void;
  readonly onDecide: (approvalId: ApprovalId, decision: ApprovalDecision) => void;
  readonly deciding: ApprovalId | undefined;
}) {
  return (
    <Card>
      <View className="gap-3">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {message.role === "user" ? "You" : "Ruth"}
        </Text>
        {message.parts.map((part, index) => (
          <MessagePartView
            key={`${message.id}-${index}`}
            part={part}
            approvals={approvals}
            onOpenArtifact={onOpenArtifact}
            onDecide={onDecide}
            deciding={deciding}
          />
        ))}
      </View>
    </Card>
  );
}

function DraftMessageView({
  parts,
  ...props
}: MessagePartProps & { readonly parts: ReadonlyArray<MessagePart> }) {
  return (
    <Card>
      <View className="gap-3">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">Ruth</Text>
        {parts.map((part, index) => (
          <MessagePartView
            key={`draft-${index}`}
            part={part}
            approvals={props.approvals}
            onOpenArtifact={props.onOpenArtifact}
            onDecide={props.onDecide}
            deciding={props.deciding}
          />
        ))}
        {parts.length === 0 ? <ActivityIndicator /> : null}
      </View>
    </Card>
  );
}

export function RuthScreen() {
  const api = useApi();
  const [state, dispatch] = useReducer(ruthReducer, initialRuthState);
  const [input, setInput] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string>();
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<ApprovalId>();
  const [artifactError, setArtifactError] = useState<string>();
  const streamStops = useRef<Set<() => void>>(new Set());

  useEffect(
    () => () => {
      for (const stop of streamStops.current) stop();
      streamStops.current.clear();
    },
    [],
  );

  const openArtifact = async (artifactId: ArtifactId) => {
    setArtifactError(undefined);
    try {
      const { url } = await call(api, (client) => client["cloud.artifactUrl"]({ artifactId }));
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      setArtifactError(errorMessage(cause));
    }
  };

  const decide = (approvalId: ApprovalId, decision: ApprovalDecision) => {
    setDeciding(approvalId);
    dispatch({ type: "clear-error" });
    let stopStream: (() => void) | undefined;
    const stop = stream(api, (client) => client["ruth.decide"]({ approvalId, decision }), {
      onEvent: (event) => {
        dispatch({ type: "event", event });
        if (event._tag === "message-completed") {
          dispatch({ type: "approval-decided", approvalId });
          setDeciding(undefined);
          if (stopStream) streamStops.current.delete(stopStream);
        }
      },
      onError: (cause) => {
        dispatch({ type: "error", message: errorMessage(cause) });
        setDeciding(undefined);
        if (stopStream) streamStops.current.delete(stopStream);
      },
    });
    stopStream = stop;
    streamStops.current.add(stop);
  };

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setPendingPrompt(text);
    setSending(true);
    dispatch({ type: "clear-error" });

    let stopStream: (() => void) | undefined;
    const stop = stream(
      api,
      (client) =>
        client["ruth.send"]({ text, ...(state.threadId ? { threadId: state.threadId } : {}) }),
      {
        onEvent: (event) => {
          dispatch({ type: "event", event });
          if (event._tag === "message-completed") {
            void call(api, (client) =>
              client["ruth.listMessages"]({ threadId: event.message.threadId }),
            )
              .then((messages) => dispatch({ type: "history-loaded", messages }))
              .catch((cause: unknown) => dispatch({ type: "error", message: errorMessage(cause) }))
              .finally(() => {
                setPendingPrompt(undefined);
                setSending(false);
                if (stopStream) streamStops.current.delete(stopStream);
              });
          }
        },
        onError: (cause) => {
          dispatch({ type: "error", message: errorMessage(cause) });
          setSending(false);
          setPendingPrompt(undefined);
          if (stopStream) streamStops.current.delete(stopStream);
        },
      },
    );
    stopStream = stop;
    streamStops.current.add(stop);
  };

  const messages = [...state.messages];
  const drafts = [...state.drafts.values()];

  return (
    <Screen
      title="Ask Ruth"
      subtitle="Ask questions grounded in your study library."
      scroll={false}
    >
      <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-3">
        {state.error ? <ErrorState message={state.error} /> : null}
        {artifactError ? <ErrorState message={artifactError} /> : null}
        {messages.length === 0 && drafts.length === 0 && !pendingPrompt ? (
          <EmptyState
            title="Start a conversation"
            description="Ask Ruth to explain something you have studied."
          />
        ) : null}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            approvals={state.pendingApprovals}
            onOpenArtifact={(artifactId) => void openArtifact(artifactId)}
            onDecide={decide}
            deciding={deciding}
          />
        ))}
        {pendingPrompt ? (
          <Card>
            <Text className="text-foreground">{pendingPrompt}</Text>
          </Card>
        ) : null}
        {drafts.map((draft) => (
          <DraftMessageView
            key={draft.id}
            parts={draft.parts}
            approvals={state.pendingApprovals}
            onOpenArtifact={(artifactId) => void openArtifact(artifactId)}
            onDecide={decide}
            deciding={deciding}
          />
        ))}
      </ScrollView>
      <View className="flex-row items-end gap-2 border-t border-border bg-background pt-3">
        <TextInput
          multiline
          editable={!sending}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Ruth"
          className="max-h-28 min-h-12 flex-1 rounded-xl border border-border bg-card px-4 py-3 text-foreground"
        />
        <View className="w-20">
          <Button onPress={send} disabled={!input.trim()} busy={sending}>
            Send
          </Button>
        </View>
      </View>
    </Screen>
  );
}
