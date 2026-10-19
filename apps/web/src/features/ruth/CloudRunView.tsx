"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { THEME_TOKEN_NAMES } from "@avenire/ui/tokens";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { CLOUD_RUN_PATH, type CloudRunRequest } from "@avenire/contracts";
import { RuthMessageParts } from "./RuthPanel";

/**
 * Starts or watches a Ruth Cloud run with the chat machinery. `start` posts a run request and
 * streams it; given a `runId` (after a reload, or from another device) the hook resumes by
 * replaying the run's durable event log from the beginning and tailing it to the end.
 */
export function useCloudRun(runId?: string) {
  const request = useRef<CloudRunRequest | undefined>(undefined);
  const [startedRunId, setStartedRunId] = useState<string>();
  const [transport] = useState(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: CLOUD_RUN_PATH,
        // The run id arrives with the response headers; keep it so the caller can resume later.
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          const id = response.headers.get("x-ruth-run-id");
          if (id) setStartedRunId(id);
          return response;
        },
        prepareSendMessagesRequest: () => ({ body: request.current ?? {} }),
      }),
  );
  // The chat id is the run id, which is what `<api>/<id>/stream` reconnects to.
  const chat = useChat<RuthUIMessage>({
    ...(runId === undefined ? {} : { id: runId }),
    transport,
    resume: runId !== undefined,
  });
  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    runId: runId ?? startedRunId,
    start: (input: CloudRunRequest) => {
      request.current = input;
      return chat.sendMessage({ text: "prompt" in input ? input.prompt : "Run task" });
    },
  };
}

/** A run's messages rendered exactly as chat renders them. */
export function CloudRunView({ runId }: { readonly runId: string }) {
  const { messages } = useCloudRun(runId);
  const { resolvedTheme } = useTheme();
  const colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  const [themeTokens, setThemeTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!resolvedTheme) return;
    const frame = requestAnimationFrame(() => {
      const root = getComputedStyle(document.documentElement);
      setThemeTokens(
        Object.fromEntries(
          THEME_TOKEN_NAMES.map((name) => [name, root.getPropertyValue(name).trim()]),
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <article key={message.id} className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {message.role === "user" ? "You" : "Ruth Cloud"}
          </p>
          <RuthMessageParts message={message} colorScheme={colorScheme} themeTokens={themeTokens} />
        </article>
      ))}
    </div>
  );
}
