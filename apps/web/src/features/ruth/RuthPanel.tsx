"use client";

import { Chat, useChat } from "@ai-sdk/react";
import {
  type ChatAddToolApproveResponseFunction,
  type ChatAddToolOutputFunction,
  validateUIMessages,
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { THEME_TOKEN_NAMES } from "@avenire/ui/tokens";
import { WidgetFrame } from "@avenire/ui/widget-frame";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { type PageContext, RUTH_CHAT_PATH } from "@avenire/contracts";
import {
  call,
  conversationSession,
  loadConversation,
  questionAnswer,
} from "@avenire/client-runtime/rpc";
import { Button } from "@avenire/ui/components/button";
import { Textarea } from "@avenire/ui/components/textarea";
import { useApi, errorMessage } from "~/lib/rpc";

type Part = RuthUIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` | "dynamic-tool" }>;

function readThemeTokens(): Record<string, string> {
  const root = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    THEME_TOKEN_NAMES.map((name) => [name, root.getPropertyValue(name).trim()]),
  );
}

/** The page facts `get_page_context` hands to Ruth, measured from the chat column. */
function measurePage(column: HTMLElement | null): PageContext {
  const root = getComputedStyle(document.documentElement);
  return {
    surface: "chat",
    platform: window.avenire ? "desktop" : "web",
    contentWidthPx: Math.round(column?.clientWidth ?? 480),
    colorScheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    themeTokens: readThemeTokens(),
    fonts: {
      body: getComputedStyle(document.body).fontFamily,
      mono: root.getPropertyValue("--font-mono").trim() || "monospace",
    },
  };
}

export function describeToolApproval(part: ToolPart): string {
  const input: unknown = part.input;
  const fields = typeof input === "object" && input !== null ? input : {};
  const title = "title" in fields && typeof fields.title === "string" ? fields.title : undefined;
  const fileId = "fileId" in fields && typeof fields.fileId === "string" ? fields.fileId : "file";
  switch (part.type) {
    case "tool-write_file":
      return `Create “${title ?? "note"}”?`;
    case "tool-move_file":
      return `Move “${title ?? fileId}” to another folder?`;
    case "tool-rename_file":
      return `Rename “${fileId}” to “${title ?? "new title"}”?`;
    case "tool-archive_file":
      return `Archive “${title ?? fileId}”?`;
    default:
      return `Allow ${getToolName(part).replaceAll("_", " ")}?`;
  }
}

function AskUserCard({
  question,
  choices,
  allowCustom,
  onAnswer,
}: {
  readonly question: string;
  readonly choices: ReadonlyArray<string>;
  readonly allowCustom: boolean;
  readonly onAnswer: (answer: string) => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <div className="grid gap-3 border border-border bg-muted p-3">
      <p className="font-medium">{question}</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <Button key={choice} size="sm" variant="outline" onClick={() => onAnswer(choice)}>
            {choice}
          </Button>
        ))}
      </div>
      {allowCustom ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (custom.trim()) onAnswer(custom.trim());
          }}
        >
          <Textarea value={custom} onChange={(event) => setCustom(event.target.value)} rows={1} />
          <Button size="sm" type="submit" disabled={!custom.trim()}>
            Answer
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** Renders one message's parts. Chat and the Cloud run watcher share it. */
export function RuthMessageParts({
  message,
  colorScheme,
  themeTokens,
  addToolApprovalResponse,
  addToolOutput,
}: {
  readonly message: RuthUIMessage;
  readonly colorScheme: "light" | "dark";
  readonly themeTokens: Record<string, string>;
  readonly addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  readonly addToolOutput?: ChatAddToolOutputFunction<RuthUIMessage>;
}) {
  function toolView(part: ToolPart, key: string) {
    if (part.state === "approval-requested") {
      return (
        <div key={key} className="grid gap-3 border border-border bg-muted p-3">
          <p className="font-medium">Approval required</p>
          <p className="text-sm text-muted-foreground">{describeToolApproval(part)}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => addToolApprovalResponse?.({ id: part.approval.id, approved: true })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addToolApprovalResponse?.({ id: part.approval.id, approved: false })}
            >
              Decline
            </Button>
          </div>
        </div>
      );
    }
    if (part.state === "output-denied") {
      return (
        <p key={key} className="text-sm text-muted-foreground">
          Action declined.
        </p>
      );
    }
    if (
      (part.type === "tool-write_file" ||
        part.type === "tool-move_file" ||
        part.type === "tool-rename_file" ||
        part.type === "tool-archive_file") &&
      part.state === "output-available" &&
      "summary" in part.output
    ) {
      return (
        <p key={key} className="text-sm text-muted-foreground">
          {part.output.summary}
        </p>
      );
    }
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return (
        <AskUserCard
          key={key}
          question={part.input.question}
          choices={part.input.choices ?? []}
          allowCustom={part.input.allowCustom}
          onAnswer={(answer) => addToolOutput?.(questionAnswer(part.toolCallId, answer))}
        />
      );
    }
    if (part.type === "tool-render_widget" && part.state === "output-available") {
      return (
        <WidgetFrame
          key={key}
          url={part.output.url}
          title={part.output.title}
          colorScheme={colorScheme}
          tokens={themeTokens}
        />
      );
    }
    if (part.type === "tool-publish_asset" && part.state === "output-available") {
      const asset = part.output;
      return (
        <div key={key} className="grid gap-2">
          {asset.mediaType.startsWith("image/") ? (
            <img src={asset.url} alt={asset.name} className="max-h-96 max-w-full object-contain" />
          ) : null}
          {asset.mediaType.startsWith("video/") ? (
            <video
              controls
              src={asset.url}
              aria-label={asset.name}
              className="max-h-96 max-w-full"
            />
          ) : null}
          <a href={`${asset.url}?download=1`} download={asset.name} className="text-sm underline">
            {asset.name} (
            {(asset.sizeBytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB)
          </a>
        </div>
      );
    }
    if (part.state === "output-error") {
      return (
        <p key={key} className="text-xs text-destructive">
          {getToolName(part)} failed: {part.errorText}
        </p>
      );
    }
    return (
      <p key={key} className="text-xs text-muted-foreground">
        {getToolName(part).replaceAll("_", " ")}
        {part.state === "output-available" ? "" : "…"}
      </p>
    );
  }

  function partView(part: Part, key: string) {
    if (isToolUIPart(part)) return toolView(part, key);
    switch (part.type) {
      case "text":
        return (
          <div key={key} className="prose prose-sm max-w-none text-foreground dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
          </div>
        );
      case "data-subagent":
        return (
          <div key={key} className="border border-border p-3 text-sm">
            Video agent: {part.data.stage ?? part.data.status}
          </div>
        );
      case "data-cloud-run":
        return (
          <div key={key} className="border border-border p-3 text-sm">
            Ruth Cloud run started.
          </div>
        );
      default:
        return null;
    }
  }
  return <>{message.parts.map((part, index) => partView(part, `${message.id}-${index}`))}</>;
}

export function RuthPanel() {
  const api = useApi();
  const { resolvedTheme } = useTheme();
  const colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  const [themeTokens, setThemeTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!resolvedTheme) return;
    // Read after next-themes applies the document class and CSS variables.
    const frame = requestAnimationFrame(() => setThemeTokens(readThemeTokens()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  const [text, setText] = useState(() => conversationSession<RuthUIMessage>(api).draft);
  const [error, setError] = useState<string>();
  const session = conversationSession<RuthUIMessage>(api);
  const [historyReady, setHistoryReady] = useState(session.ready);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const column = useRef<HTMLDivElement>(null);

  session.pageContext = () => measurePage(column.current);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: RUTH_CHAT_PATH,
        // The server owns the history; send only the latest message.
        prepareSendMessagesRequest: ({ messages: current }) => ({
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

  async function send() {
    const message = text.trim();
    if (!message || working || !historyReady) return;
    setError(undefined);
    setText("");
    session.draft = "";
    try {
      await session.send(async () => {
        await session.ensureThread(async () => {
          const thread = await call(api, (client) =>
            client["ruth.createThread"]({ title: message.slice(0, 60) }),
          );
          return thread.id;
        });
        await sendMessage({ text: message });
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={column} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask Ruth to explain something from your library.
          </p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {message.role === "user" ? "You" : "Ruth"}
            </p>
            <RuthMessageParts
              message={message}
              colorScheme={colorScheme}
              themeTokens={themeTokens}
              addToolApprovalResponse={addToolApprovalResponse}
              addToolOutput={addToolOutput}
            />
          </article>
        ))}
        {error || chatError ? (
          <p role="alert" className="text-sm text-destructive">
            {error ?? errorMessage(chatError)}
            {!historyReady ? (
              <Button
                variant="outline"
                onClick={() => {
                  setError(undefined);
                  setHistoryAttempt((value) => value + 1);
                }}
              >
                Retry history
              </Button>
            ) : null}
          </p>
        ) : null}
      </div>
      <form
        className="grid gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            session.draft = event.target.value;
          }}
          placeholder="Ask about your material"
          rows={3}
        />
        <Button type="submit" disabled={!historyReady || working || !text.trim()}>
          {working ? "Ruth is working…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
