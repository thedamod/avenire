"use client";

import type { CloudRunId, FileId } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApi, useQuery } from "~/lib/rpc";

import { useCloudRun } from "~/features/chat/CloudRunView";
import { parseQuiz, type Quiz } from "./logic/quiz.ts";
import { runPhase, runProducts } from "./logic/report.ts";

/**
 * Everything a morning report reads: the run (summary, assets, status), its UI message stream
 * (replayed from the durable event log and tailed while it runs) and its approvals (including resolved decisions).
 */
export function useRunReport(runId: CloudRunId) {
  const api = useApi();
  const run = useQuery((client) => client["cloud.getRun"]({ runId }), `report-run-${runId}`);
  const approvals = useQuery(
    (client) => client["cloud.listPendingApprovals"]({ runId, includeResolved: true }),
    `report-approvals-${runId}`,
  );
  const stream = useCloudRun(runId);
  const products = useMemo(() => runProducts(stream.messages), [stream.messages]);

  // When the live stream ends, the run row has its summary and assets and the outputs exist.
  const previous = useRef(stream.status);
  const { refetch: refetchRun } = run;
  const { refetch: refetchApprovals } = approvals;
  useEffect(() => {
    const was = previous.current;
    previous.current = stream.status;
    if ((was === "streaming" || was === "submitted") && stream.status !== was) {
      void refetchRun();
      void refetchApprovals();
      invalidateLibrary(api, ["files", "folders"]);
    }
  }, [api, refetchApprovals, refetchRun, stream.status]);

  const phase = run.data ? runPhase(run.data.status) : null;
  // A dropped stream must not leave a cached active status on screen after the worker finishes.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refetchRun();
    }, 8_000);
    return () => clearInterval(timer);
  }, [phase, refetchRun]);

  return { run, approvals, stream, products, phase };
}

const quizCache = new Map<FileId, Promise<Quiz | null>>();

function loadQuiz(api: ReturnType<typeof useApi>, fileId: FileId): Promise<Quiz | null> {
  let hit = quizCache.get(fileId);
  if (!hit) {
    hit = call(api, (client) => client["library.getFileContentUrl"]({ fileId }))
      .then((content) => fetch(content.url))
      .then((response) => (response.ok ? response.json() : null))
      .then((json: unknown) => parseQuiz(json))
      .catch(() => {
        quizCache.delete(fileId);
        return null;
      });
    quizCache.set(fileId, hit);
  }
  return hit;
}

/** JSON outputs fetched in parallel and parsed; a file maps to its quiz or null (not a quiz). */
export function useQuizFiles(fileIds: readonly FileId[]): ReadonlyMap<FileId, Quiz | null> {
  const api = useApi();
  const key = fileIds.join(",");
  const [quizzes, setQuizzes] = useState<ReadonlyMap<FileId, Quiz | null>>(new Map());
  useEffect(() => {
    setQuizzes(new Map());
    if (!key) return;
    let live = true;
    const ids = key.split(",") as FileId[];
    void Promise.all(ids.map((id) => loadQuiz(api, id).then((quiz) => [id, quiz] as const))).then(
      (entries) => {
        if (live) setQuizzes(new Map(entries));
      },
    );
    return () => {
      live = false;
    };
  }, [api, key]);
  return quizzes;
}
