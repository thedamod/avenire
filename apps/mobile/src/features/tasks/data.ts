import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { call } from "@avenire/client-runtime/rpc";
import type { CloudRun, CloudTask, CloudTaskId } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { useApi } from "../../state/api";
import { errorMessage } from "../../ui";

export function useTasks() {
  return useQuery((client) => client["cloud.listTasks"](), "activity-cloud-tasks");
}
export function useScheduleData() {
  const folders = useQuery((client) => client["library.listFolders"](), "schedule-folders");
  const settings = useQuery((client) => client["settings.get"](), "settings");
  return { folders, settings };
}
export function useTaskActivity() {
  const threads = useQuery((client) => client["ruth.listThreads"](), "library-threads");
  const runs = useQuery((client) => client["cloud.listRuns"]({ limit: 50 }), "tasks-cloud-runs");
  const tasks = useTasks();
  const folders = useQuery((client) => client["library.listFolders"](), "tasks-folders");
  const approvals = useQuery(
    (client) => client["cloud.listPendingApprovals"]({}),
    "tasks-approvals",
  );
  useLiveRuns(runs.data, runs.refetch);
  return { threads, runs, tasks, folders, approvals };
}
export function useTaskDetail(taskId: CloudTaskId) {
  const threads = useQuery((client) => client["ruth.listThreads"](), "library-threads");
  const tasks = useTasks();
  const runs = useQuery(
    (client) => client["cloud.listRuns"]({ taskId, limit: 30 }),
    `task-detail-runs-${taskId}`,
  );
  const folders = useQuery((client) => client["library.listFolders"](), "task-detail-folders");
  useLiveRuns(runs.data, runs.refetch);
  return { tasks, runs, folders, threads, cloudThread: threads.data?.find((thread) => thread.kind === "ruth-cloud"), task: tasks.data?.find((task) => task.id === taskId) };
}
function useLiveRuns(runs: readonly CloudRun[] | undefined, refetch: () => Promise<unknown>) {
  const focused = useIsFocused();
  const live = runs?.some((run) => ["scheduled", "running", "provisioning"].includes(run.status));
  useEffect(() => {
    if (!focused || !live) return;
    const timer = setInterval(() => void refetch(), 8_000);
    return () => clearInterval(timer);
  }, [focused, live, refetch]);
}
export function useTaskActions(onChanged: () => void) {
  const api = useApi();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  async function mutate(task: CloudTask, action: "run" | "toggle" | "delete") {
    if (locked.current || (action === "delete" && task.builtin)) return false;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (action === "run")
        await call(api, (client) => client["cloud.runTaskNow"]({ taskId: task.id }));
      else if (action === "delete")
        await call(api, (client) => client["cloud.deleteTask"]({ taskId: task.id }));
      else
        await call(api, (client) =>
          client["cloud.updateTask"]({ taskId: task.id, patch: { enabled: !task.enabled } }),
        );
      setNotice(
        action === "run"
          ? "Ava started it."
          : action === "delete"
            ? "Task deleted."
            : task.enabled
              ? "Paused."
              : "Resumed.",
      );
      onChanged();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, notice, mutate };
}
export function useTaskFollowUp() {
  const api = useApi();
  return (task: CloudTask) =>
    call(api, (client) =>
      client["ruth.createThread"]({
        title: `Follow up · ${task.title}`.slice(0, 200),
        ...(task.preHydration.flatMap(
          (rule) => rule.selector.filters?.folderIds ?? rule.selector.explicit?.folderIds ?? [],
        )[0]
          ? {
              folderId: task.preHydration.flatMap(
                (rule) =>
                  rule.selector.filters?.folderIds ?? rule.selector.explicit?.folderIds ?? [],
              )[0]!,
            }
          : {}),
      }),
    );
}

export function runTime(run: CloudRun) {
  return run.finishedAt ?? run.startedAt ?? run.scheduledFor;
}
export function runDuration(run: CloudRun) {
  if (!run.startedAt) return null;
  const seconds = Math.max(
    0,
    Math.floor(
      ((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) /
        1000,
    ),
  );
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function runStatus(run: CloudRun, pending = 0) {
  if (run.status === "failed") return { label: "Didn't finish", color: "#FF6B6B" };
  if (run.status === "running" || run.status === "provisioning")
    return {
      label: `${run.status === "running" ? "Running" : "Starting"}${runDuration(run) ? ` · ${runDuration(run)}` : ""}`,
      color: "#C2D4FF",
    };
  if (run.status === "cancelled") return { label: "Cancelled", color: "#6E6E6E" };
  if (run.status === "scheduled") return { label: "Scheduled", color: "#6E6E6E" };
  if (pending) return { label: "Waiting for you", color: "#F2C46D" };
  return { label: run.assets.length ? `${run.assets.length} made` : "Finished", color: "#6E6E6E" };
}
