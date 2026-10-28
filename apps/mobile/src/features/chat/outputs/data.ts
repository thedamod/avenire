import type {
  Asset,
  AssetId,
  CloudRun,
  CloudRunId,
  FileId,
  LibraryFile,
  ThreadId,
} from "@avenire/contracts";
import { CLOUD_RUN_PATH } from "@avenire/contracts";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Effect from "effect/Effect";
import { useQuery } from "../../../lib/useRpc";
import { apiUrl, getCookieHeader } from "../../../state/auth";
import { collectCitations, object, string } from "../citations/model";

export type OutputKind = "summary" | "quiz" | "revision" | "widget";
export interface OutputFile {
  fileId: FileId;
  title: string;
  file?: LibraryFile;
}

/** Read persisted thread products, then the referenced run's output notebook and assets.
 * Never infer a run from an unrelated user's latest task or notebook title. */
export function useOutputs(threadId: ThreadId, requestedId?: string, requestedKind?: OutputKind, requestedRunId?: CloudRunId) {
  const query = useQuery(
    (client) =>
      Effect.gen(function* () {
        const [messages, listedFiles, listedAssets] = yield* Effect.all(
          [
            client["ruth.listMessages"]({ threadId }),
            client["library.listFiles"]({}),
            client["assets.list"]({ threadId }),
          ],
          { concurrency: "unbounded" },
        );
        const files = [...listedFiles];
        const threadAssets = [...listedAssets];
        const published = new Map<FileId, OutputFile>();
        const hydrated = new Set<FileId>();
        let runId: CloudRunId | undefined = requestedRunId;
        for (const message of messages) {
          const metadataRun = string(object(message.metadata).runId);
          if (!requestedRunId && metadataRun) runId = metadataRun as CloudRunId;
          for (const raw of message.parts) {
            const part = object(raw);
            if (part.type === "data-cloud-run") {
              const id = string(object(part.data).runId);
              if (!requestedRunId && id) runId = id as CloudRunId;
            }
            if (part.state !== "output-available") continue;
            const name =
              part.type === "dynamic-tool"
                ? part.toolName
                : String(part.type).replace(/^tool-/, "");
            const output = object(part.output);
            if (name === "publish_output" && output.kind === "file" && string(output.fileId)) {
              const fileId = output.fileId as FileId;
              published.set(fileId, {
                fileId,
                title: string(object(part.input).title) ?? "Output",
              });
            }
            if (name === "hydrate_files" && Array.isArray(output.files))
              for (const item of output.files) {
                const id = string(object(item).fileId);
                if (id) hydrated.add(id as FileId);
              }
          }
        }
        let requestedAsset = threadAssets.find((asset) => asset.id === requestedId);
        if (requestedId && requestedKind === "widget" && !requestedAsset) {
          requestedAsset = yield* client["assets.get"]({ assetId: requestedId as AssetId });
          threadAssets.push(requestedAsset);
        }
        if (requestedAsset?.runId) runId = requestedAsset.runId;
        let run: CloudRun | undefined = runId
          ? yield* client["cloud.getRun"]({ runId })
          : undefined;
        const fileById = new Map(files.map((file) => [file.id, file]));
        let requestedFile = requestedId ? fileById.get(requestedId as FileId) : undefined;
        if (requestedId && requestedKind !== "widget" && !requestedFile) {
          requestedFile = yield* client["library.getFile"]({ fileId: requestedId as FileId });
          fileById.set(requestedFile.id, requestedFile);
          files.push(requestedFile);
        }
        if (
          requestedFile?.source === "ruth-cloud" &&
          (!run?.folderId || !requestedFile.folderIds.includes(run.folderId))
        ) {
          const runs = yield* client["cloud.listRuns"]({ limit: 100 });
          run = runs.find(
            (candidate) =>
              candidate.folderId && requestedFile.folderIds.includes(candidate.folderId),
          );
        }
        const outputFiles = files.filter(
          (file) =>
            file.placement !== "archived" &&
            (run?.folderId ? file.folderIds.includes(run.folderId) : published.has(file.id)),
        );
        // An explicit file target may be a just-created output absent from the library projection.
        if (requestedId && !outputFiles.some((file) => file.id === requestedId)) {
          const existing = fileById.get(requestedId as FileId);
          if (existing) outputFiles.push(existing);
        }
        const notes = outputFiles.filter((file) => file.kind === "note");
        const summary = notes.find((file) => /summary/i.test(file.title)) ?? notes[0];
        const revision =
          notes.find((file) => /revision/i.test(file.title)) ??
          notes.find((file) => file.id !== summary?.id);
        const quizzes = outputFiles.filter(
          (file) => file.mimeType === "application/json" || /\.json$/i.test(file.title),
        );
        const quiz =
          quizzes.find((file) => /quiz|questions|test yourself/i.test(file.title)) ?? quizzes[0];
        const assets = new Map<string, Asset>();
        for (const asset of [
          ...(run?.assets ?? []),
          ...threadAssets.filter((asset) => !run || asset.runId === run.id),
        ])
          assets.set(asset.id, asset);
        const widgets = [...assets.values()].filter((asset) => asset.kind === "widget");
        const source = [...hydrated]
          .map((id) => fileById.get(id))
          .find((file) => file?.kind === "pdf" || file?.kind === "video");
        return {
          run,
          summary,
          revision,
          quiz,
          notes,
          quizzes,
          widgets,
          source,
          fileById,
          citations: collectCitations(messages),
        };
      }),
    `mobile-outputs-${threadId}-${requestedKind ?? ""}-${requestedId ?? ""}-${requestedRunId ?? ""}`,
  );
  const runId = query.data?.run?.id;
  const [transport] = useState(
    () =>
      new DefaultChatTransport<RuthUIMessage>({
        api: `${apiUrl}${CLOUD_RUN_PATH}`,
        fetch: expoFetch as typeof globalThis.fetch,
        credentials: "omit",
        headers: getCookieHeader,
      }),
  );
  // GET-only reconnect replays durable tool results; it never starts a Cloud run.
  const replay = useChat<RuthUIMessage>({
    id: runId ?? `output-${threadId}`,
    transport,
    resume: runId !== undefined,
    throttle: 50,
  });
  const previous = useRef(replay.status);
  useEffect(() => {
    const was = previous.current;
    previous.current = replay.status;
    if ((was === "streaming" || was === "submitted") && replay.status !== was) void query.refetch();
  }, [replay.status, query.refetch]);
  const data = useMemo(() => {
    if (!query.data) return;
    const citations = new Map([...query.data.citations, ...collectCitations(replay.messages)]);
    const hydrated: FileId[] = [];
    for (const message of replay.messages)
      for (const raw of message.parts) {
        const part = object(raw);
        if (part.type !== "tool-hydrate_files" || part.state !== "output-available") continue;
        const files = object(part.output).files;
        if (Array.isArray(files))
          for (const file of files) {
            const id = string(object(file).fileId);
            if (id) hydrated.push(id as FileId);
          }
      }
    const source =
      query.data.source ??
      hydrated
        .map((id) => query.data!.fileById.get(id))
        .find((file) => file?.kind === "pdf" || file?.kind === "video");
    return {
      ...query.data,
      citations,
      source,
      sourceCount:
        new Set(hydrated).size ||
        new Set([...citations.values()].map((citation) => citation.sourceId)).size,
    };
  }, [query.data, replay.messages]);
  return {
    ...query,
    data,
    replayError: replay.error,
    retryReplay: () => {
      void replay.resumeStream();
    },
  };
}

export function useOutputNote(fileId: FileId) {
  return useQuery(
    (client) => client["library.getNote"]({ fileId }),
    `mobile-output-note-${fileId}`,
  );
}

export function useOutputJson(fileId: FileId) {
  return useQuery(
    (client) =>
      Effect.flatMap(client["library.getFileContentUrl"]({ fileId }), (content) =>
        Effect.tryPromise({
          try: async (signal) => {
            const response = await fetch(content.url, { signal });
            if (!response.ok) throw new Error("This quiz couldn't be downloaded.");
            return (await response.json()) as unknown;
          },
          catch: (error) =>
            error instanceof Error ? error : new Error("This quiz couldn't be read."),
        }),
      ),
    `mobile-output-json-${fileId}`,
  );
}
