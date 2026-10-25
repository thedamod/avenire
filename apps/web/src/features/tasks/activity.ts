"use client";

import { useMemo } from "react";
import type {
  CloudRun,
  CloudTask,
  CloudTaskId,
  FolderId,
  HydrationRule,
  RuthThread,
} from "@avenire/contracts";
import { useQuery } from "~/lib/rpc";

export type ActivityItem =
  | {
      readonly kind: "chat";
      readonly id: string;
      readonly title: string;
      readonly folderId: FolderId | null;
      readonly at: string;
      readonly href: string;
      readonly thread: RuthThread;
    }
  | {
      readonly kind: "run";
      readonly id: string;
      readonly title: string;
      readonly folderId: FolderId | null;
      readonly at: string;
      readonly href: string;
      readonly run: CloudRun;
    };

/** First notebook a task reads, for the row's notebook chip. */
export function taskFolderIds(rules: readonly HydrationRule[]): FolderId[] {
  const ids = new Set<FolderId>();
  for (const { selector } of rules) {
    for (const id of selector.explicit?.folderIds ?? []) ids.add(id);
    for (const id of selector.filters?.folderIds ?? []) ids.add(id);
  }
  return [...ids];
}

export function runTime(run: CloudRun): string {
  return run.finishedAt ?? run.startedAt ?? run.scheduledFor;
}

export function runTitle(taskTitle: string, separator = ": "): string {
  return /^overnight\b/i.test(taskTitle)
    ? taskTitle
    : `Overnight${separator}${lowerFirst(taskTitle)}`;
}

function lowerFirst(text: string) {
  return text.length > 1 && text[1] === text[1]!.toLowerCase()
    ? text[0]!.toLowerCase() + text.slice(1)
    : text;
}

/** Where a run row goes: the morning report when it produced something, else the task. */
export function runHref(run: CloudRun): string {
  return run.status === "succeeded" ? `/report/${run.id}` : `/tasks/${run.taskId}`;
}

export function buildActivity(
  threads: readonly RuthThread[],
  runs: readonly CloudRun[],
  tasks: readonly CloudTask[],
  separator?: string,
): ActivityItem[] {
  const taskFolder = new Map<CloudTaskId, FolderId | null>(
    tasks.map((task) => [task.id, taskFolderIds(task.preHydration)[0] ?? null]),
  );
  const chats: ActivityItem[] = threads
    .filter((thread) => thread.kind === "chat")
    .map((thread) => ({
      kind: "chat",
      id: thread.id,
      title: thread.title || "New chat",
      folderId: thread.folderId,
      at: thread.lastMessageAt ?? thread.updatedAt,
      href: `/chat/${thread.id}`,
      thread,
    }));
  const overnight: ActivityItem[] = runs.map((run) => ({
    kind: "run",
    id: run.id,
    title: runTitle(run.taskTitle, separator),
    folderId: taskFolder.get(run.taskId) ?? null,
    at: runTime(run),
    href: runHref(run),
    run,
  }));
  return [...chats, ...overnight].sort((a, b) => b.at.localeCompare(a.at));
}

/** Threads, runs and tasks in parallel. Run lists have no live projection; call `refetch`. */
export function useActivityData(prefix: string) {
  const threads = useQuery((client) => client["ruth.listThreads"](), "library-threads");
  const runs = useQuery(
    (client) => client["cloud.listRuns"]({ limit: 50 }),
    `${prefix}-cloud-runs`,
  );
  const tasks = useCloudTasks();
  return { threads, runs, tasks };
}

export function useActivity(prefix: string, separator?: string) {
  const data = useActivityData(prefix);
  const items = useMemo(
    () =>
      (data.threads.data || data.threads.error) && (data.runs.data || data.runs.error)
        ? buildActivity(
            data.threads.data ?? [],
            data.runs.data ?? [],
            data.tasks.data ?? [],
            separator,
          )
        : undefined,
    [
      data.threads.data,
      data.threads.error,
      data.runs.data,
      data.runs.error,
      data.tasks.data,
      separator,
    ],
  );
  return {
    ...data,
    items,
    // Show what loaded even if one source failed; error only when nothing came back.
    error:
      !data.threads.data && !data.runs.data ? (data.threads.error ?? data.runs.error) : undefined,
    refetch: () => {
      void data.threads.refetch();
      void data.runs.refetch();
      void data.tasks.refetch();
    },
  };
}

/** Shared task cache keeps Home, scheduled rows and detail controls in sync. */
export function useCloudTasks() {
  return useQuery((client) => client["cloud.listTasks"](), "activity-cloud-tasks");
}
