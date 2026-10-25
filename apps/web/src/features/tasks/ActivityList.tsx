"use client";

import Link from "next/link";
import { memo } from "react";
import type { CloudRun, Folder, FolderId } from "@avenire/contracts";
import { Cloud, MessageSquare, Moon } from "lucide-react";
import { cn } from "@avenire/ui/lib/utils";
import { NotebookTag, RelativeTime } from "~/components/app";
import { formatDuration, type RelativeStyle } from "~/lib/time";
import { useNow } from "~/lib/useNow";
import { useApi } from "~/lib/rpc";
import { prefetchChat } from "~/features/library/prefetch";
import { ActivityItemContextMenu } from "./ActivityItemContextMenu";
import type { ActivityItem } from "./activity";

/** Right-hand status of a run, or null when the time alone says enough. */
export function RunStatus({
  run,
  pending = 0,
  detailed = false,
}: {
  run: CloudRun;
  pending?: number | undefined;
  /** Tasks page: "Finished · 3 made". */
  detailed?: boolean | undefined;
}) {
  const now = useNow();
  if (run.status === "failed") return <span className="text-destructive/85">Didn't finish</span>;
  if (run.status === "cancelled") return <span className="text-muted-foreground">Cancelled</span>;
  if (run.status === "running" || run.status === "provisioning") {
    const elapsed = run.startedAt ? ` · ${formatDuration(now - Date.parse(run.startedAt))}` : "";
    return <span className="text-ruth-text">Running{elapsed}</span>;
  }
  if (run.status === "scheduled") return <span className="text-muted-foreground">Scheduled</span>;
  if (pending > 0) return <span className="text-warning">Waiting for you</span>;
  if (detailed)
    return (
      <span className="text-muted-foreground">
        Finished{run.assets.length ? ` · ${run.assets.length} made` : ""}
      </span>
    );
  return null;
}

export const ActivityRow = memo(function ActivityRow({
  item,
  folder,
  runIcon = "cloud",
  timeStyle = "day",
  pending,
  detailed,
}: {
  item: ActivityItem;
  folder: Folder | undefined;
  runIcon?: "cloud" | "moon";
  timeStyle?: RelativeStyle;
  pending?: number | undefined;
  detailed?: boolean | undefined;
}) {
  const api = useApi();
  const warm = () => {
    if (item.kind === "chat") void prefetchChat(api, item.thread.id);
  };
  const Icon = item.kind === "chat" ? MessageSquare : runIcon === "moon" ? Moon : Cloud;
  const status =
    item.kind === "run" ? <RunStatus run={item.run} pending={pending} detailed={detailed} /> : null;
  const failed = item.kind === "run" && item.run.status === "failed";
  const time = <RelativeTime iso={item.at} format={timeStyle} />;
  const tag = folder ? <NotebookTag name={folder.name} color={folder.color} /> : null;

  return (
    <ActivityItemContextMenu item={item}>
      <Link
        href={item.href}
        onPointerEnter={warm}
        onFocus={warm}
        onTouchStart={warm}
        className="group flex flex-col gap-1 px-4 py-3 transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:h-11 md:flex-row md:items-center md:gap-3 md:py-0"
      >
        <div className="flex min-w-0 items-center gap-2 md:flex-1 md:gap-3">
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className={cn(
              "size-[15px] shrink-0",
              item.kind === "run" ? "text-ruth-text" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-[15px] leading-5 md:shrink-0 md:max-w-[60%] md:text-[13.5px] md:font-medium">
            {item.title}
          </span>
          <span className="hidden min-w-0 md:inline-flex">{tag}</span>
          <span className="ml-auto shrink-0 pl-2 text-[13px] md:hidden">{status ?? time}</span>
        </div>
        <span className="hidden shrink-0 text-[12.5px] md:flex md:items-center md:gap-4">
          {status}
          {!failed ? time : null}
        </span>
      </Link>
    </ActivityItemContextMenu>
  );
});

/** Bordered divider list on desktop, full-bleed rows on phone. */
export function ActivityList({
  items,
  folderById,
  pendingByRun,
  ...rowProps
}: {
  items: readonly ActivityItem[];
  folderById: ReadonlyMap<FolderId, Folder>;
  pendingByRun?: ReadonlyMap<string, number>;
} & Omit<React.ComponentProps<typeof ActivityRow>, "item" | "folder" | "pending">) {
  return (
    <div className="-mx-4 divide-y divide-border md:mx-0 md:overflow-hidden md:rounded-[10px] md:border md:border-border md:bg-card">
      {items.map((item) => (
        <ActivityRow
          key={`${item.kind}-${item.id}`}
          item={item}
          folder={item.folderId ? folderById.get(item.folderId) : undefined}
          pending={item.kind === "run" ? pendingByRun?.get(item.id) : undefined}
          {...rowProps}
        />
      ))}
    </div>
  );
}
