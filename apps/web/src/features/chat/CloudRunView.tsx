"use client";

import { useChat } from "@ai-sdk/react";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { CLOUD_RUN_PATH, type CloudRunRequest } from "@avenire/contracts";
import { DefaultChatTransport } from "ai";
import { useMemo, useRef, useState } from "react";

import { collectCitations } from "./logic/citations.ts";
import { deriveRows } from "./logic/rows.ts";
import { CitationContext } from "./markdown/Markdown.tsx";
import { useWidgetTheme } from "./pageContext.ts";
import { TimelineContext, TimelineRow, type TimelineActions } from "./timeline/TimelineRows.tsx";

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
    throttle: 50,
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

/** A run's messages rendered with the chat rows (work log, prose, figures), not virtualised. */
export function CloudRunView({ runId }: { readonly runId: string }) {
  const { messages, status, error } = useCloudRun(runId);
  const { colorScheme, tokens } = useWidgetTheme();
  const [workExpanded, setWorkExpanded] = useState<ReadonlyMap<string, boolean>>(new Map());
  const rows = useMemo(
    () =>
      deriveRows({
        messages,
        status,
        workExpanded,
        timings: new Map(),
        turnStartedAt: null,
        error: error ? error.message : null,
      }).filter((row) => row.kind !== "user"),
    [messages, status, workExpanded, error],
  );
  const citations = useMemo(() => collectCitations(messages), [messages]);
  const actions = useMemo<TimelineActions>(
    () => ({
      toggleWork: (messageId, expanded) =>
        setWorkExpanded((current) => new Map(current).set(messageId, expanded)),
      colorScheme,
      themeTokens: tokens,
    }),
    [colorScheme, tokens],
  );
  return (
    <CitationContext.Provider value={citations}>
      <TimelineContext.Provider value={actions}>
        <div className="flex flex-col">
          {rows.map((row) => (
            <TimelineRow key={row.id} row={row} />
          ))}
        </div>
      </TimelineContext.Provider>
    </CitationContext.Provider>
  );
}
