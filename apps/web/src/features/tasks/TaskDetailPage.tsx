"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CloudRun, CloudTaskId } from "@avenire/contracts";
import {
  CircleAlert,
  CircleCheck,
  Circle,
  Clock3,
  Files,
  LoaderCircle,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { call } from "@avenire/client-runtime/rpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@avenire/ui/components/alert-dialog";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { Switch } from "@avenire/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@avenire/ui/components/tooltip";
import { PageColumn, PageHeader, RelativeTime, type HeaderCrumb } from "~/components/app";
import { ErrorRow } from "~/features/home/states";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { formatDuration } from "~/lib/time";
import { ActivityItemContextMenu } from "./ActivityItemContextMenu";
import { runHref, runTime, taskFolderIds, useCloudTasks } from "./activity";
import { ScheduleTaskDialog } from "./ScheduleTaskDialog";
import { readsLabel } from "./TasksPage";
import { describeSchedule } from "./schedule";
import { useDocumentTitle } from "~/lib/document-title";

/** One overnight task: schedule, on/off, the latest failure and run history (21b / M25). */
export function TaskDetailPage({ taskId }: { taskId: CloudTaskId }) {
  const api = useApi();
  const router = useRouter();
  const tasks = useCloudTasks();
  const runs = useQuery(
    (client) => client["cloud.listRuns"]({ taskId, limit: 30 }),
    `task-detail-runs-${taskId}`,
  );
  const folders = useQuery((client) => client["library.listFolders"](), "task-detail-folders");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const task = tasks.data?.find((item) => item.id === taskId);
  const folderById = useMemo(
    () => new Map((folders.data ?? []).map((folder) => [folder.id, folder] as const)),
    [folders.data],
  );
  const history = useMemo(
    () => (runs.data ?? []).toSorted((a, b) => runTime(b).localeCompare(runTime(a))),
    [runs.data],
  );
  const latest = history[0];

  const live =
    latest?.status === "running" ||
    latest?.status === "provisioning" ||
    latest?.status === "scheduled";
  const refetchRuns = runs.refetch;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refetchRuns(), 8_000);
    return () => clearInterval(timer);
  }, [live, refetchRuns]);

  async function runNow() {
    setBusy(true);
    try {
      await call(api, (client) => client["cloud.runTaskNow"]({ taskId }));
      toast("Ava started it. You'll see it in the morning report.");
      void runs.refetch();
    } catch (cause) {
      toast.error(`Couldn't start it: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    tasks.setData((previous) =>
      previous?.map((item) => (item.id === taskId ? { ...item, enabled } : item)),
    );
    try {
      await call(api, (client) => client["cloud.updateTask"]({ taskId, patch: { enabled } }));
    } catch (cause) {
      toast.error(errorMessage(cause));
      void tasks.refetch();
    }
  }

  async function remove() {
    if (!task || task.builtin) return;
    try {
      await call(api, (client) => client["cloud.deleteTask"]({ taskId }));
      toast("Task deleted");
      router.push("/tasks");
    } catch (cause) {
      toast.error(`Couldn't delete it: ${errorMessage(cause)}`);
    }
  }

  const folder = task ? folderById.get(taskFolderIds(task.preHydration)[0]!) : undefined;
  const crumbs: HeaderCrumb[] = [
    ...(folder
      ? [{ label: folder.name, href: `/notebooks/${folder.id}`, color: folder.color }]
      : []),
    { label: task?.title ?? "Overnight task" },
  ];
  const failed = latest?.status === "failed";
  useDocumentTitle(task?.title ?? "Overnight task");

  return (
    <main className="pb-[calc(48px+env(safe-area-inset-bottom))]">
      <PageHeader
        backHref="/tasks"
        crumbs={crumbs}
        title={task?.title ?? "Overnight task"}
        status={failed ? <span className="text-destructive/85">Didn't finish</span> : undefined}
        actions={[
          { label: "Edit task", icon: Pencil, onSelect: () => setEditing(true), disabled: !task },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: () => setConfirmDelete(true),
            disabled: !task || !!task.builtin,
          },
        ]}
      />
      <PageColumn width={736} className="flex flex-col gap-8 pt-4 md:pt-6">
        {tasks.error && !tasks.data ? (
          <ErrorRow error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : !tasks.data ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : !task ? (
          <p className="text-[13.5px] text-muted-foreground">
            This task doesn't exist any more.{" "}
            <Link href="/tasks" className="text-foreground hover:underline">
              Back to Chats and Tasks
            </Link>
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-6 border-b border-border pb-6">
              <div className="flex items-start justify-between gap-4">
                <h1 className="min-w-0 text-2xl leading-[30px] font-semibold break-words">
                  {task.title}
                </h1>
                <div className="flex shrink-0 items-center gap-1">
                  <TaskInfo icon={Clock3} label="Task schedule">
                    {describeSchedule(task.schedule)} · {task.timeZone}
                  </TaskInfo>
                  {readsLabel(task, folderById) ? (
                    <TaskInfo icon={Files} label="Task sources">
                      {readsLabel(task, folderById)}
                    </TaskInfo>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="text-[13.5px] font-medium">Instructions</h2>
                <p className="text-[13.5px] leading-5 whitespace-pre-wrap break-words text-foreground-soft">
                  {task.prompt}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 text-[13.5px]">
                  <Switch checked={task.enabled} onCheckedChange={(on) => void setEnabled(on)} />
                  <span>{task.enabled ? "Scheduled runs on" : "Scheduled runs off"}</span>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto max-md:h-10"
                  disabled={busy}
                  onClick={() => void runNow()}
                >
                  Run now
                </Button>
              </div>
            </section>

            {failed && latest ? (
              <FailedRun run={latest} onRetry={() => void runNow()} busy={busy} />
            ) : null}

            <section className="flex flex-col gap-2">
              <h2 className="text-[13.5px] font-medium">Run history</h2>
              {runs.error && !runs.data ? (
                <ErrorRow error={runs.error} onRetry={() => void runs.refetch()} />
              ) : !runs.data ? (
                <Skeleton className="h-24 w-full" />
              ) : history.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Hasn't run yet. {task.nextRunAt ? "First run tonight." : ""}
                </p>
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {history.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </PageColumn>

      <ScheduleTaskDialog
        open={editing}
        onOpenChange={setEditing}
        task={task}
        onSaved={(saved) =>
          tasks.setData((previous) =>
            previous?.map((item) => (item.id === saved.id ? saved : item)),
          )
        }
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              Ava stops running it. Past morning reports and anything you accepted stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void remove()}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function TaskInfo({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-11 text-muted-foreground md:size-8"
          aria-label={label}
          onClick={() => setOpen((previous) => !previous)}
        >
          <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent align="end" className="max-w-64">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function ranFor(run: CloudRun): string | null {
  if (!run.startedAt) return null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  return formatDuration(end - Date.parse(run.startedAt));
}

function clock(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;
}

function FailedRun({ run, onRetry, busy }: { run: CloudRun; onRetry: () => void; busy: boolean }) {
  const duration = ranFor(run);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3 text-[13.5px]">
        <span className="font-medium">
          {duration ? `Ran overnight for ${duration}` : "Didn't start"}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {[
            new Date(run.scheduledFor).toLocaleDateString(undefined, { weekday: "short" }),
            run.startedAt ? `started ${clock(run.startedAt)}` : null,
            run.finishedAt ? `stopped ${clock(run.finishedAt)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="flex items-start gap-3">
        <CircleAlert
          className="mt-0.5 size-4 shrink-0 text-destructive/85"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[13.5px] font-medium">Couldn't finish</p>
          <p className="border-l-2 border-destructive-line pl-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground-soft">
            {run.error ?? "The run stopped without saying why."}
          </p>
        </div>
      </div>
      {run.summary ? <p className="text-[14px] leading-[22px]">{run.summary}</p> : null}
      <p className="text-[13px] text-muted-foreground">Nothing in your notebooks changed.</p>
      <div className="flex gap-2">
        <Button disabled={busy} onClick={onRetry} className="max-md:h-11 max-md:flex-1">
          Retry now
        </Button>
      </div>
    </section>
  );
}

function RunRow({ run }: { run: CloudRun }) {
  const Icon =
    run.status === "failed"
      ? CircleAlert
      : run.status === "succeeded"
        ? CircleCheck
        : run.status === "running" || run.status === "provisioning"
          ? LoaderCircle
          : Circle;
  const tone =
    run.status === "failed"
      ? "text-destructive/85"
      : run.status === "running" || run.status === "provisioning"
        ? "text-ruth-text"
        : "text-muted-foreground";
  const label = {
    scheduled: "Scheduled",
    provisioning: "Starting",
    running: "Running",
    succeeded: run.assets.length ? `Finished · ${run.assets.length} made` : "Finished",
    failed: "Didn't finish",
    cancelled: "Cancelled",
  }[run.status];
  const duration = ranFor(run);
  const content = (
    <>
      <Icon
        className={`size-4 shrink-0 ${tone} ${run.status === "running" ? "animate-spin" : ""}`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-3">
        <span className="shrink-0 text-[13.5px]">
          {new Date(run.scheduledFor).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          {run.attempt > 1 ? (
            <span className="text-muted-foreground"> · attempt {run.attempt}</span>
          ) : null}
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">
          {[duration ? `ran for ${duration}` : null, run.summary].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={`shrink-0 text-[12.5px] ${tone}`}>{label}</span>
      <RelativeTime iso={runTime(run)} format="day" className="w-16 text-right max-md:hidden" />
    </>
  );
  const className = "flex min-h-12 items-center gap-3 py-2 md:min-h-11";
  return (
    <li>
      <ActivityItemContextMenu
        item={{
          kind: "run",
          id: run.id,
          title: run.taskTitle,
          folderId: null,
          at: runTime(run),
          href: runHref(run),
          run,
        }}
      >
        {run.status === "succeeded" ? (
          <Link
            href={`/report/${run.id}`}
            className={`${className} transition-colors hover:bg-hover`}
          >
            {content}
          </Link>
        ) : (
          <div tabIndex={0} className={className}>
            {content}
          </div>
        )}
      </ActivityItemContextMenu>
    </li>
  );
}
