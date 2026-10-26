"use client";

import { useState } from "react";
import {
  AlignLeft,
  CircleHelp,
  FileText,
  ChartNoAxesCombined,
  PlaySquare,
  Spline,
} from "lucide-react";
import type { CloudTask, FolderId } from "@avenire/contracts";
import { toast } from "sonner";
import { call } from "@avenire/client-runtime/rpc";
import { useScrollFade } from "@avenire/ui/components/scroll-fade";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@avenire/ui/components/select";
import { Switch } from "@avenire/ui/components/switch";
import { Textarea } from "@avenire/ui/components/textarea";
import { ResponsiveDialog } from "~/components/app";
import { TaskSourcesSelect } from "./TaskSourcesSelect";
import { TaskLanyardPreview } from "./TaskLanyardPreview";
import { TASK_OUTPUTS, readTaskOutputs, writeTaskOutputs, type TaskOutput } from "./task-outputs";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import {
  READY_TIMES,
  formatClock,
  fromRules,
  fromSchedule,
  repeatLabel,
  toRules,
  toSchedule,
  type Repeat,
} from "./schedule";

/**
 * "New overnight task" (15 / M26): what to do, what Ruth may read, when it should be ready,
 * and whether to email. Pass `task` to edit an existing one.
 */
export function ScheduleTaskDialog({
  open,
  onOpenChange,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: CloudTask | undefined;
  onSaved?: (task: CloudTask) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? "Edit overnight task" : "New overnight task"}
      hideTitle
      full
      sheetClassName="[&>[data-slot=sheet-title]]:p-0"
      className="max-h-[calc(100dvh-48px)] max-w-[1104px] overflow-hidden [&>[data-slot=dialog-title]]:p-0 sm:max-w-[1104px]"
    >
      <ScheduleForm task={task} onClose={() => onOpenChange(false)} onSaved={onSaved} />
    </ResponsiveDialog>
  );
}

/** Mounted only while open, so every open starts from `task`. */
function ScheduleForm({
  task,
  onClose,
  onSaved,
}: {
  task: CloudTask | undefined;
  onClose: () => void;
  onSaved: ((task: CloudTask) => void) | undefined;
}) {
  const api = useApi();
  const folders = useQuery((client) => client["library.listFolders"](), "schedule-folders");
  const [initial] = useState(() => ({
    ...(task ? fromSchedule(task.schedule) : { repeat: "weeknights" as Repeat, readyBy: "07:00" }),
    ...(task
      ? fromRules(task.preHydration)
      : { folderIds: [] as FolderId[], todaysCaptures: true }),
  }));
  const [title, setTitle] = useState(task?.title ?? "");
  const [brief] = useState(() => readTaskOutputs(task?.prompt ?? ""));
  const [prompt, setPrompt] = useState(brief.instructions);
  const [outputs, setOutputs] = useState<TaskOutput[]>(brief.outputs);
  const [repeat, setRepeat] = useState<Repeat>(initial.repeat);
  const [readyBy, setReadyBy] = useState(
    READY_TIMES.includes(initial.readyBy) ? initial.readyBy : "07:00",
  );
  const [folderIds, setFolderIds] = useState<FolderId[]>(initial.folderIds);
  const [todaysCaptures, setTodaysCaptures] = useState(initial.todaysCaptures);
  const [email, setEmail] = useState(task?.delivery.email ?? false);
  const [keepWorkspace, setKeepWorkspace] = useState((task?.workspace ?? "keep") === "keep");
  const [busy, setBusy] = useState(false);

  const savedPrompt = writeTaskOutputs(prompt, outputs);
  const valid = title.trim().length > 0 && savedPrompt.length > 0 && savedPrompt.length <= 20_000;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const input = {
      title: title.trim(),
      prompt: savedPrompt,
      schedule: toSchedule(repeat, readyBy),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preHydration: toRules(folderIds, todaysCaptures),
      delivery: { email },
      workspace: keepWorkspace ? ("keep" as const) : ("delete" as const),
    };
    try {
      const saved = task
        ? await call(api, (client) => client["cloud.updateTask"]({ taskId: task.id, patch: input }))
        : await call(api, (client) => client["cloud.createTask"]({ ...input, enabled: true }));
      toast(
        task
          ? "Task updated"
          : `Scheduled · ${repeatLabel(repeat).toLowerCase()}, ready by ${formatClock(readyBy)}`,
      );
      onClose();
      onSaved?.(saved);
    } catch (cause) {
      toast.error(`Couldn't schedule it: ${errorMessage(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  const activeFolders = (folders.data ?? []).filter((folder) => folder.archivedAt === null);
  const label = "text-[13px] font-medium";

  const outputIcons = [FileText, CircleHelp, AlignLeft, Spline, PlaySquare, ChartNoAxesCombined];

  const formFade = useScrollFade<HTMLFormElement>("y");
  return (
    <div className="grid min-h-0 shrink-0 md:shrink md:grid-cols-[minmax(0,1.28fr)_minmax(0,1fr)]">
      <form
        ref={formFade}
        onSubmit={submit}
        className="edge-fade-y flex min-h-0 flex-col gap-4 overflow-y-auto px-5 md:gap-3 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:max-h-[calc(100dvh-48px)] md:border-r md:border-border md:px-7 md:pt-6 md:pb-5"
      >
        <div className="pr-5">
          <h2 className="text-[17px] font-semibold">
            {task ? "Edit overnight task" : "New overnight task"}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Ruth works on this while you sleep and leaves the results in your morning report.
            Nothing in your files changes until you accept it.
          </p>
        </div>
        <label className="flex flex-col gap-2">
          <span className={label}>Task</span>
          <Input
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Turn today's lectures into revision material"
            className="h-11 md:h-9"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={label}>Instructions</span>
          <Textarea
            value={prompt}
            maxLength={20_000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Write a one-page summary and an 8-question quiz. Use the wording from my notes."
            className="h-[76px] min-h-[76px] max-h-[76px] resize-none overflow-y-auto"
            style={{ fieldSizing: "fixed" }}
          />
        </label>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className={`${label} mb-2`}>Ruth can read</legend>
          <TaskSourcesSelect
            folders={activeFolders}
            folderIds={folderIds}
            todaysCaptures={todaysCaptures}
            onFolderIdsChange={setFolderIds}
            onTodaysCapturesChange={setTodaysCaptures}
            loading={folders.data === undefined && !folders.error}
            error={Boolean(folders.error)}
          />
        </fieldset>
        <fieldset>
          <legend className={`${label} mb-2`}>Make</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TASK_OUTPUTS.map((output, index) => {
              const Icon = outputIcons[index]!;
              const selected = outputs.includes(output);
              return (
                <button
                  key={output}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setOutputs((current) =>
                      selected ? current.filter((item) => item !== output) : [...current, output],
                    )
                  }
                  className={`flex min-h-[70px] flex-col items-center justify-center gap-2 rounded-lg border px-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-ring ${selected ? "border-ruth bg-ruth-tint text-ruth-text" : "border-input text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {output}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div>
          <p className={`${label} mb-2`}>Ruth can change</p>
          <div className="rounded-lg border border-input px-3 py-2 text-center text-[12px] text-foreground-soft">
            Propose changes, I accept
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className={label}>Repeat</span>
            <Select value={repeat} onValueChange={(value) => setRepeat(value as Repeat)}>
              <SelectTrigger className="h-11 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["tonight", "nightly", "weeknights"] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {repeatLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-2">
            <span className={label}>Ready by</span>
            <Select value={readyBy} onValueChange={setReadyBy}>
              <SelectTrigger className="h-11 md:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {READY_TIMES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatClock(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <label className="flex items-center justify-between gap-4 text-[13.5px]">
          <span>
            Email me when it's ready
            <span className="block text-[12.5px] text-muted-foreground">
              The morning report is always on home.
            </span>
          </span>
          <Switch checked={email} onCheckedChange={setEmail} />
        </label>
        <label className="flex items-center justify-between gap-4 text-[13.5px]">
          <span>
            Keep Ruth's workspace
            <span className="block text-[12.5px] text-muted-foreground">
              Off deletes the sandbox after each run. Your report and files stay.
            </span>
          </span>
          <Switch checked={keepWorkspace} onCheckedChange={setKeepWorkspace} />
        </label>
        {savedPrompt.length > 20_000 ? (
          <p role="alert" className="text-xs text-destructive">
            Instructions and output choices must fit within 20,000 characters.
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="max-md:h-11">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="ruth"
            disabled={!valid || busy}
            className="max-md:h-11 max-md:flex-1"
          >
            {task ? "Save" : "Schedule"}
          </Button>
        </div>
      </form>
      <aside className="relative min-h-0" aria-label="Live overnight task preview">
        <TaskLanyardPreview
          title={title}
          instructions={prompt}
          sources={[
            ...(todaysCaptures ? ["Today's captures"] : []),
            ...activeFolders
              .filter((folder) => folderIds.includes(folder.id))
              .map((folder) => folder.name),
          ]}
          outputs={outputs}
          repeat={repeatLabel(repeat)}
          readyBy={formatClock(readyBy)}
          email={email}
        />
      </aside>
    </div>
  );
}
