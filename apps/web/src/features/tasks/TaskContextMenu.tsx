"use client";

import { useState, type ReactElement } from "react";
import type { CloudTask } from "@avenire/contracts";
import { call } from "@avenire/client-runtime/rpc";
import { toast } from "sonner";
import { ItemContextMenu, type ContextAction } from "~/components/app/ItemContextMenu";
import { errorMessage, invalidateQueries, useApi } from "~/lib/rpc";
import { useCloudTasks } from "./activity";
import { buildTaskActions } from "./activityActions";
import { DeleteActivityDialog } from "./DeleteActivityDialog";

export function TaskContextMenu({
  task,
  onEdit,
  children,
}: {
  task: CloudTask;
  onEdit(): void;
  children: ReactElement | ((actions: readonly ContextAction[], busy: boolean) => ReactElement);
}) {
  const api = useApi();
  const tasks = useCloudTasks();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function mutate(action: "run" | "toggle" | "delete") {
    if (busy || (action === "delete" && task.builtin)) return;
    setBusy(true);
    if (action !== "run")
      tasks.setData((rows) =>
        action === "delete"
          ? rows?.filter((row) => row.id !== task.id)
          : rows?.map((row) =>
              row.id === task.id ? { ...row, enabled: !task.enabled, nextRunAt: null } : row,
            ),
      );
    try {
      if (action === "run")
        await call(api, (client) => client["cloud.runTaskNow"]({ taskId: task.id }));
      else if (action === "delete")
        await call(api, (client) => client["cloud.deleteTask"]({ taskId: task.id }));
      else
        await call(api, (client) =>
          client["cloud.updateTask"]({ taskId: task.id, patch: { enabled: !task.enabled } }),
        );
      setConfirm(false);
      toast(
        action === "run"
          ? "Ava started it"
          : action === "delete"
            ? "Task deleted"
            : task.enabled
              ? "Paused"
              : "Resumed",
      );
    } catch (cause) {
      if (action !== "run")
        tasks.setData((rows) =>
          rows
            ? action === "delete"
              ? [task, ...rows.filter((row) => row.id !== task.id)]
              : rows.map((row) => (row.id === task.id ? task : row))
            : rows,
        );
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
      invalidateQueries(
        api,
        (key) =>
          key.includes("cloud-runs") ||
          key.includes("cloud-tasks") ||
          key.startsWith("task-detail-"),
      );
    }
  }
  const actions = buildTaskActions(task, busy, {
    run: () => void mutate("run"),
    toggle: () => void mutate("toggle"),
    edit: onEdit,
    remove: () => setConfirm(true),
  });
  return (
    <>
      <ItemContextMenu actions={actions}>
        {typeof children === "function" ? children(actions, busy) : children}
      </ItemContextMenu>
      <DeleteActivityDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this task?"
        description="Ava stops running it. Past morning reports and anything you accepted stay."
        busy={busy}
        onConfirm={() => void mutate("delete")}
      />
    </>
  );
}
