"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RuthUIMessage } from "@avenire/ai/ruth-messages";
import {
  type ArtifactId,
  type FileAction,
  type PageContext,
  RUTH_CHAT_PATH,
  type ThreadId,
} from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { Button } from "@avenire/ui/components/button";
import { Textarea } from "@avenire/ui/components/textarea";
import { useApi, errorMessage } from "~/lib/rpc";

type Part = RuthUIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` }>;

const THEME_TOKENS = [
  "--background",
  "--foreground",
  "--primary",
  "--muted",
  "--border",
  "--accent",
];

/** The page facts `get_page_context` hands to Ruth, measured from the chat column. */
function measurePage(column: HTMLElement | null): PageContext {
  const root = getComputedStyle(document.documentElement);
  return {
    surface: "chat",
    platform: window.avenire ? "desktop" : "web",
    contentWidthPx: Math.round(column?.clientWidth ?? 480),
    colorScheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    themeTokens: Object.fromEntries(
      THEME_TOKENS.map((token) => [token, root.getPropertyValue(token).trim()]),
    ),
    fonts: {
      body: getComputedStyle(document.body).fontFamily,
      mono: root.getPropertyValue("--font-mono").trim() || "monospace",
    },
  };
}

function ArtifactView({
  artifactId,
  label,
}: {
  readonly artifactId: ArtifactId;
  readonly label: string;
}) {
  const api = useApi();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void call(api, (client) => client["cloud.artifactUrl"]({ artifactId }))
      .then((result) => {
        if (active) setUrl(result.url);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [api, artifactId]);
  return (
    <div className="grid gap-2 border border-border p-3">
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : url ? (
        <img src={url} alt={label} className="max-h-64 max-w-full object-contain" />
      ) : (
        <p className="text-sm text-muted-foreground">Loading {label}…</p>
      )}
    </div>
  );
}

function describeAction(action: FileAction): string {
  switch (action._tag) {
    case "move":
      return "Move a library item into another cluster.";
    case "rename":
      return `Rename an item to “${action.title}”.`;
    case "delete":
      return "Archive a library item.";
    case "create-note":
      return `Create the note “${action.title}”.`;
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

export function RuthPanel() {
  const api = useApi();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const threadId = useRef<ThreadId>(undefined);
  const column = useRef<HTMLDivElement>(null);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: RUTH_CHAT_PATH,
        // The server owns the history; send only the latest message.
        prepareSendMessagesRequest: ({ messages: current }) => ({
          body: {
            threadId: threadId.current,
            message: current.at(-1),
            page: measurePage(column.current),
            fast: false,
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

  async function send() {
    const message = text.trim();
    if (!message || working) return;
    setError(undefined);
    setText("");
    try {
      if (threadId.current === undefined) {
        const thread = await call(api, (client) =>
          client["ruth.createThread"]({ title: message.slice(0, 60) }),
        );
        threadId.current = thread.id;
      }
      await sendMessage({ text: message });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  function toolView(part: ToolPart, key: string) {
    if (part.type === "tool-propose_file_action") {
      if (part.state === "approval-requested") {
        return (
          <div key={key} className="grid gap-3 border border-border bg-muted p-3">
            <p className="font-medium">Approval required</p>
            <p className="text-sm text-muted-foreground">{describeAction(part.input.action)}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
              >
                Decline
              </Button>
            </div>
          </div>
        );
      }
      if (part.state === "output-available") {
        return (
          <p key={key} className="text-sm text-muted-foreground">
            {part.output.summary}
          </p>
        );
      }
      if (part.state === "output-denied") {
        return (
          <p key={key} className="text-sm text-muted-foreground">
            File action declined.
          </p>
        );
      }
    }
    if (part.type === "tool-ask_user" && part.state === "input-available") {
      return (
        <AskUserCard
          key={key}
          question={part.input.question}
          choices={part.input.choices ?? []}
          allowCustom={part.input.allowCustom}
          onAnswer={(answer) =>
            addToolOutput({
              tool: "ask_user",
              toolCallId: part.toolCallId,
              output: { answers: [answer] },
            })
          }
        />
      );
    }
    if (part.type === "tool-run_python" && part.state === "output-available") {
      return (
        <div key={key} className="grid gap-2">
          {part.output.stdout ? (
            <pre className="overflow-auto border border-border bg-muted p-3 text-xs">
              <code>{part.output.stdout}</code>
            </pre>
          ) : null}
          {part.output.figures.map((figure) => (
            <ArtifactView
              key={figure.artifactId}
              artifactId={figure.artifactId}
              label={figure.title}
            />
          ))}
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
    if (isStaticToolUIPart(part)) return toolView(part, key);
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
            {message.parts.map((part, index) => partView(part, `${message.id}-${index}`))}
          </article>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
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
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask about your material"
          rows={3}
        />
        <Button type="submit" disabled={working || !text.trim()}>
          {working ? "Ruth is working…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
