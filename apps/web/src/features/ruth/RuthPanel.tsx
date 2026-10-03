"use client";

import { useEffect, useReducer, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  Approval,
  ApprovalDecision,
  ApprovalId,
  ArtifactId,
  Item,
  Message,
  MessagePart,
} from "@avenire/contracts";
import { call, stream } from "@avenire/client-runtime/rpc";
import { Button } from "@avenire/ui/components/button";
import { Textarea } from "@avenire/ui/components/textarea";
import { useApi, errorMessage } from "~/lib/rpc";
import { initialRuthState, ruthReducer } from "./ruthReducer";
import { ItemDetail } from "~/features/library/ItemDetail";

function ArtifactView({
  artifactId,
  kind,
  label,
}: {
  readonly artifactId: ArtifactId;
  readonly kind: "plot" | "video";
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
        kind === "video" ? (
          <video controls src={url} className="max-h-64 w-full" />
        ) : (
          <img src={url} alt={label} className="max-h-64 max-w-full object-contain" />
        )
      ) : (
        <p className="text-sm text-muted-foreground">Loading {label}…</p>
      )}
    </div>
  );
}

function ApprovalCard({
  approval,
  onDecide,
  deciding,
}: {
  readonly approval: Approval;
  readonly onDecide: (id: ApprovalId, decision: ApprovalDecision) => void;
  readonly deciding: boolean;
}) {
  let description: string;
  switch (approval.action._tag) {
    case "move":
      description = "Move a library item into another cluster.";
      break;
    case "rename":
      description = `Rename an item to “${approval.action.title}”.`;
      break;
    case "delete":
      description = "Delete a library item.";
      break;
    case "create-note":
      description = `Create the note “${approval.action.title}”.`;
      break;
  }
  return (
    <div className="grid gap-3 border border-border bg-muted p-3">
      <p className="font-medium">Approval required</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      {approval.status === "pending" ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={deciding} onClick={() => onDecide(approval.id, "approved")}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={deciding}
            onClick={() => onDecide(approval.id, "rejected")}
          >
            Reject
          </Button>
        </div>
      ) : (
        <p className="text-sm">{approval.status}</p>
      )}
    </div>
  );
}

export function RuthPanel() {
  const api = useApi();
  const [state, dispatch] = useReducer(ruthReducer, initialRuthState);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<ApprovalId>();
  const [items, setItems] = useState<ReadonlyArray<Item>>([]);
  const [selectedItem, setSelectedItem] = useState<Item>();

  useEffect(() => {
    void call(api, (client) => client["library.listItems"]({}))
      .then(setItems)
      .catch(() => undefined);
  }, [api]);
  useEffect(() => {
    const threadId = state.threadId;
    if (!threadId) return;
    let active = true;
    void call(api, (client) => client["ruth.listMessages"]({ threadId }))
      .then((messages) => {
        if (active) dispatch({ type: "history-loaded", messages });
      })
      .catch((cause: unknown) => {
        if (active) dispatch({ type: "error", message: errorMessage(cause) });
      });
    return () => {
      active = false;
    };
  }, [api, state.threadId]);

  function send() {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    dispatch({ type: "clear-error" });
    const unsubscribe = stream(
      api,
      (client) =>
        client["ruth.send"]({
          ...(state.threadId ? { threadId: state.threadId } : {}),
          text: message,
        }),
      {
        onEvent: (event) => {
          dispatch({ type: "event", event });
          if (event._tag === "message-completed") setSending(false);
        },
        onError: (cause) => {
          dispatch({ type: "error", message: errorMessage(cause) });
          setSending(false);
        },
      },
    );
    setText("");
    window.setTimeout(unsubscribe, 120_000);
  }

  function decide(approvalId: ApprovalId, decision: ApprovalDecision) {
    setDeciding(approvalId);
    const unsubscribe = stream(api, (client) => client["ruth.decide"]({ approvalId, decision }), {
      onEvent: (event) => dispatch({ type: "event", event }),
      onError: (cause) => dispatch({ type: "error", message: errorMessage(cause) }),
    });
    dispatch({ type: "approval-decided", approvalId });
    window.setTimeout(() => {
      unsubscribe();
      setDeciding(undefined);
    }, 120_000);
  }

  function partView(part: MessagePart, key: string) {
    switch (part._tag) {
      case "text":
        return (
          <div key={key} className="prose prose-sm max-w-none text-foreground dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            {part.citations.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {part.citations.map((citation) => (
                  <button
                    key={citation.chunkId}
                    className="border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    onClick={() =>
                      setSelectedItem(items.find((item) => item.id === citation.itemId))
                    }
                  >
                    {citation.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      case "code":
        return (
          <pre key={key} className="overflow-auto border border-border bg-muted p-3 text-xs">
            <code>{part.source}</code>
            {part.stdout ? (
              <code className="mt-2 block text-muted-foreground">{part.stdout}</code>
            ) : null}
          </pre>
        );
      case "widget":
        return (
          <div key={key} className="grid gap-2">
            <p className="text-sm font-medium">{part.title}</p>
            <iframe
              title={part.title}
              sandbox="allow-scripts"
              srcDoc={part.html}
              className="h-64 w-full border border-border bg-background"
            />
          </div>
        );
      case "plot":
        return <ArtifactView key={key} artifactId={part.artifactId} kind="plot" label={part.alt} />;
      case "video":
        return (
          <ArtifactView key={key} artifactId={part.artifactId} kind="video" label={part.title} />
        );
      case "approval": {
        const approval = state.pendingApprovals.get(part.approvalId);
        return approval ? (
          <ApprovalCard
            key={key}
            approval={approval}
            onDecide={decide}
            deciding={deciding === approval.id}
          />
        ) : (
          <p key={key} className="text-sm text-muted-foreground">
            Approval request received.
          </p>
        );
      }
    }
  }

  const messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly parts: ReadonlyArray<MessagePart>;
  }> = [
    ...state.messages,
    ...[...state.drafts.values()].map((draft) => ({
      id: draft.id,
      role: "assistant",
      parts: draft.parts,
    })),
  ];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
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
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <form
        className="grid gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask about your material"
          rows={3}
        />
        <Button type="submit" disabled={sending || !text.trim()}>
          {sending ? "Ruth is working…" : "Send"}
        </Button>
      </form>
      {selectedItem ? (
        <ItemDetail item={selectedItem} onClose={() => setSelectedItem(undefined)} />
      ) : null}
    </div>
  );
}
