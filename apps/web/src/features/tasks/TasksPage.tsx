"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CloudTask, Folder, FolderId } from "@avenire/contracts";
import { Clock, Moon, Search, X } from "lucide-react";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Button } from "@avenire/ui/components/button";
import { Chip } from "@avenire/ui/components/chip";
import { Tabs, TabsList, TabsTrigger } from "@avenire/ui/components/tabs";
import { PageColumn, PageHeader } from "~/components/app";
import { ErrorRow, ListSkeleton } from "~/features/home/states";
import { useQuery } from "~/lib/rpc";
import { daysAgo } from "~/lib/time";
import { TaskContextMenu } from "./TaskContextMenu";
import { ActivityList } from "./ActivityList";
import { useActivity, type ActivityItem } from "./activity";
import { ScheduleTaskDialog } from "./ScheduleTaskDialog";
import { describeSchedule, fromRules, nextRunLabel } from "./schedule";

type Filter = "all" | "chats" | "overnight" | "scheduled";

function parseFilter(value: string | null): Filter {
  return value === "chats" || value === "overnight" || value === "scheduled" ? value : "all";
}

/** Everything Ruth has done or will do: chats, overnight runs, scheduled tasks (21a / M24). */
export function TasksPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const [needle, setNeedle] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scheduling, setScheduling] = useState(false);
  const [editing, setEditing] = useState<CloudTask>();

  const activity = useActivity("tasks-page", " · ");
  const folders = useQuery((client) => client["library.listFolders"](), "tasks-page-folders");
  const approvals = useQuery(
    (client) => client["cloud.listPendingApprovals"]({}),
    "tasks-page-approvals",
  );
  const folderById = useMemo(
    () => new Map((folders.data ?? []).map((folder) => [folder.id, folder] as const)),
    [folders.data],
  );
  const pendingByRun = useMemo(() => {
    const counts = new Map<string, number>();
    for (const approval of approvals.data ?? [])
      if (approval.status === "pending")
        counts.set(approval.runId, (counts.get(approval.runId) ?? 0) + 1);
    return counts;
  }, [approvals.data]);

  // Runs have no live projection: poll while one is in flight.
  const live = activity.runs.data?.some(
    (run) => run.status === "running" || run.status === "provisioning",
  );
  const refetchRuns = activity.runs.refetch;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refetchRuns(), 10_000);
    return () => clearInterval(timer);
  }, [live, refetchRuns]);

  const query = needle.trim().toLowerCase();
  const items = (activity.items ?? []).filter(
    (item) =>
      (filter === "all" ||
        (filter === "chats"
          ? item.kind === "chat"
          : filter === "overnight" && item.kind === "run")) &&
      (!query || item.title.toLowerCase().includes(query)),
  );
  const tasks = (activity.tasks.data ?? []).filter(
    (task) =>
      (filter === "all" || filter === "scheduled") &&
      (!query || task.title.toLowerCase().includes(query)),
  );
  const counts = {
    all: (activity.items?.length ?? 0) + (activity.tasks.data?.length ?? 0),
    chats: activity.items?.filter((item) => item.kind === "chat").length ?? 0,
    overnight: activity.items?.filter((item) => item.kind === "run").length ?? 0,
    scheduled: activity.tasks.data?.length ?? 0,
  };

  const setFilter = (next: string) =>
    router.replace(next === "all" ? pathname : `${pathname}?filter=${next}`, { scroll: false });

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const groups = groupByTime(items);

  return (
    <main className="pb-[calc(48px+env(safe-area-inset-bottom))]">
      <PageHeader
        title="Chats and Tasks"
        actions={[
          {
            label: "New overnight task",
            icon: Moon,
            pinned: true,
            onSelect: () => setScheduling(true),
          },
        ]}
      />
      <PageColumn className="pt-2 md:pt-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] md:text-2xl md:leading-[30px]">
            Chats and Tasks
          </h1>
          <Button variant="outline" onClick={() => setScheduling(true)} className="max-md:hidden">
            <Moon />
            New overnight task
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:mt-5 md:flex-row md:items-end md:gap-6">
          <div className="hidden w-full items-end border-b border-border md:flex">
            <Tabs value={filter} onValueChange={setFilter} className="min-w-0 flex-1 gap-0">
              <TabsList className="gap-6 border-b-0">
                {(["all", "chats", "overnight", "scheduled"] as const).map((value) => (
                  <TabsTrigger key={value} value={value} className="gap-1.5 text-[13.5px]">
                    {filterLabel(value)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {counts[value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div
              className={`mb-1.5 flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-input bg-surface-3 transition-[width] duration-moderate ease-out ${searchOpen ? "w-56" : "w-[76px]"}`}
            >
              {searchOpen ? (
                <>
                  <Search
                    className="ml-2.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    value={needle}
                    onChange={(event) => setNeedle(event.target.value)}
                    placeholder="Search"
                    aria-label="Search chats and tasks"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setNeedle("");
                        setSearchOpen(false);
                      }
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setNeedle("");
                      setSearchOpen(false);
                    }}
                    aria-label="Close search"
                    className="mr-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search chats and tasks"
                  className="inline-flex h-full w-full items-center justify-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Search className="size-3.5" aria-hidden="true" />
                  Search
                </button>
              )}
            </div>
          </div>
          <ScrollFade
            axis="x"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:hidden"
          >
            {(["all", "chats", "overnight", "scheduled"] as const).map((value) => (
              <Chip key={value} asChild active={filter === value}>
                <button
                  type="button"
                  onClick={() => setFilter(value)}
                  className="h-[34px] px-3.5 text-[13px]"
                >
                  {filterLabel(value)}{" "}
                  <span className="text-muted-foreground">{counts[value]}</span>
                </button>
              </Chip>
            ))}
          </ScrollFade>
          <label className="relative md:hidden">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={needle}
              onChange={(event) => setNeedle(event.target.value)}
              placeholder="Search chats and tasks"
              aria-label="Search chats and tasks"
              className="h-11 w-full rounded-lg border border-input bg-surface-3 pr-3 pl-8 text-[13.5px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-7">
          {activity.error ? <ErrorRow error={activity.error} onRetry={activity.refetch} /> : null}
          {tasks.length ? (
            <Section label="Scheduled">
              <ul className="-mx-4 divide-y divide-border md:mx-0 md:border-y md:border-border">
                {tasks.map((task) => (
                  <ScheduledRow
                    key={task.id}
                    task={task}
                    folderById={folderById}
                    onEdit={() => setEditing(task)}
                  />
                ))}
              </ul>
            </Section>
          ) : null}
          {activity.items === undefined && !activity.error ? (
            <ListSkeleton rows={5} />
          ) : filter !== "scheduled" ? (
            groups.length ? (
              groups.map(([label, group]) => (
                <Section key={label} label={label}>
                  <ActivityList
                    items={group}
                    folderById={folderById}
                    runIcon="moon"
                    timeStyle="clock"
                    detailed
                    pendingByRun={pendingByRun}
                  />
                </Section>
              ))
            ) : (
              <p className="py-8 text-center text-[13.5px] text-muted-foreground">
                {query ? "Nothing matches that." : "No chats or overnight runs yet."}
              </p>
            )
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-muted-foreground">
              No scheduled tasks. Leave Ava something to do overnight.
            </p>
          ) : null}
        </div>
      </PageColumn>
      <ScheduleTaskDialog
        open={scheduling}
        onOpenChange={setScheduling}
        onSaved={activity.refetch}
      />
      <ScheduleTaskDialog
        open={editing !== undefined}
        task={editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={activity.refetch}
      />
    </main>
  );
}

function filterLabel(filter: Filter) {
  return { all: "All", chats: "Chats", overnight: "Overnight", scheduled: "Scheduled" }[filter];
}

function groupByTime(items: readonly ActivityItem[]): [string, ActivityItem[]][] {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const days = daysAgo(item.at);
    const label =
      days <= 0 ? "Today" : days < 7 ? "This week" : days < 31 ? "This month" : "Earlier";
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups];
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12.5px] text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

export function readsLabel(
  task: CloudTask,
  folderById: ReadonlyMap<FolderId, Folder>,
): string | null {
  const { folderIds, todaysCaptures } = fromRules(task.preHydration);
  const names = folderIds.map((id) => folderById.get(id)?.name).filter(Boolean) as string[];
  if (todaysCaptures) names.push("today's captures");
  return names.length ? `reads ${names.join(" + ")}` : null;
}

function ScheduledRow({
  task,
  folderById,
  onEdit,
}: {
  task: CloudTask;
  folderById: ReadonlyMap<FolderId, Folder>;
  onEdit: () => void;
}) {
  const subtitle = [describeSchedule(task.schedule), readsLabel(task, folderById)]
    .filter(Boolean)
    .join(" · ");
  const actionClass =
    "h-11 rounded-lg px-1 text-[13px] text-foreground-soft transition-colors hover:text-foreground disabled:opacity-40 md:h-8";
  return (
    <TaskContextMenu task={task} onEdit={onEdit}>
      {(actions, busy) => (
        <li
          tabIndex={0}
          className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-0"
        >
          <Link
            href={`/tasks/${task.id}`}
            className="flex min-w-0 flex-1 items-start gap-3 md:items-center"
          >
            <Clock
              className="mt-0.5 size-4 shrink-0 text-foreground-soft md:mt-0"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-medium md:text-[13.5px]">
                {task.title}
              </span>
              <span className="truncate text-[12.5px] text-muted-foreground">{subtitle}</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-4 pl-7 md:pl-0">
            <span className="text-[13px]">{nextRunLabel(task)}</span>
            {actions
              .filter((action) => action.group === "edit")
              .map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={busy}
                  className={actionClass}
                  onClick={() => action.onSelect?.()}
                >
                  {action.label === "Edit schedule…" ? "Edit" : action.label}
                </button>
              ))}
          </div>
        </li>
      )}
    </TaskContextMenu>
  );
}
