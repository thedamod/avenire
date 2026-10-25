"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrashEntry } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { Trash2, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
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
import { buttonVariants } from "@avenire/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@avenire/ui/components/sheet";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@avenire/ui/components/tooltip";
import { useArrivedLate, usePresence, usePresenceList } from "@avenire/ui/components/presence";
import { cn } from "@avenire/ui/lib/utils";
import { PageColumn, PageHeader, plural } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { useNow } from "~/lib/useNow";
import { contextTargets } from "~/features/library/contextTargets";
import { buildTrashActions } from "./trashActions";
import { TrashRow } from "./TrashRow";
import { entryHref, entryKey, entryRef, entryTitle } from "./trash-utils";

type Confirm = { readonly entries: readonly TrashEntry[] } | "empty";

export function TrashPage() {
  const api = useApi();
  const router = useRouter();
  const now = useNow();
  const { folderById } = useLibrary();
  const { data, error, loading, refetch, setData } = useQuery(
    (client) => client["library.listTrash"](),
    "library-trash",
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [confirm, setConfirm] = useState<Confirm>();
  const [sheetEntry, setSheetEntry] = useState<TrashEntry>();

  const entries = useMemo(() => data ?? [], [data]);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selected.has(entryKey(entry))),
    [entries, selected],
  );
  const selecting = selected.size > 0;
  const rows = usePresenceList(data, entryKey);
  const late = useArrivedLate(data);
  // The dock keeps its last count while it slides away.
  const dock = usePresence(selecting ? selected.size : null, 150);

  const toggle = useCallback((entry: TrashEntry) => {
    const key = entryKey(entry);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);

  /** Removes rows right away, restoring the previous list if the call fails. */
  const mutate = useCallback(
    async (removed: readonly TrashEntry[], run: () => Promise<unknown>, failure: string) => {
      const keys = new Set(removed.map(entryKey));
      setData((previous) => previous?.filter((entry) => !keys.has(entryKey(entry))));
      setSelected((previous) => new Set([...previous].filter((key) => !keys.has(key))));
      try {
        await run();
        return true;
      } catch (cause) {
        setData((previous) => {
          const present = new Set(previous?.map(entryKey));
          return [...(previous ?? []), ...removed.filter((entry) => !present.has(entryKey(entry)))];
        });
        toast.error(`${failure}: ${errorMessage(cause)}`);
        return false;
      } finally {
        invalidateLibrary(api, ["files", "folders", "trash"]);
      }
    },
    [api, setData],
  );

  const restore = useCallback(
    async (removed: readonly TrashEntry[]) => {
      if (!removed.length) return;
      const ok = await mutate(
        removed,
        () => call(api, (client) => client["library.restore"]({ refs: removed.map(entryRef) })),
        "Couldn't restore",
      );
      if (!ok) return;
      const first = removed[0]!;
      toast(
        removed.length === 1 ? `Restored ${entryTitle(first)}` : `Restored ${removed.length} items`,
        removed.length === 1
          ? {
              action: {
                label: "Open",
                onClick: () => router.push(entryHref(first)),
              },
            }
          : undefined,
      );
    },
    [api, mutate, router],
  );

  const purge = useCallback(
    async (removed: readonly TrashEntry[]) => {
      await mutate(
        removed,
        () => call(api, (client) => client["library.purge"]({ refs: removed.map(entryRef) })),
        "Couldn't delete",
      );
    },
    [api, mutate],
  );

  const emptyTrash = useCallback(async () => {
    await mutate(
      entries,
      () => call(api, (client) => client["library.emptyTrash"]()),
      "Couldn't empty Trash",
    );
  }, [api, entries, mutate]);

  const requestRestore = useCallback((entry: TrashEntry) => void restore([entry]), [restore]);
  const requestPurge = useCallback((entry: TrashEntry) => setConfirm({ entries: [entry] }), []);
  const openActions = useCallback((entry: TrashEntry) => setSheetEntry(entry), []);

  const actionsFor = (targets: readonly TrashEntry[]) =>
    buildTrashActions(targets.length, {
      restore: () => void restore(targets),
      purge: () => setConfirm({ entries: targets }),
    });
  const entryByKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  const selectionActions = actionsFor(selectedEntries);
  const sheetActions = sheetEntry ? actionsFor([sheetEntry]) : [];

  const confirmCopy =
    confirm === "empty"
      ? {
          title: "Empty Trash?",
          body: `${plural(entries.length, "item")} will be deleted for good. This can't be undone.`,
          action: "Empty trash",
        }
      : confirm
        ? {
            title:
              confirm.entries.length === 1
                ? `Delete "${entryTitle(confirm.entries[0]!)}" forever?`
                : `Delete ${confirm.entries.length} items forever?`,
            body: "This can't be undone.",
            action: "Delete forever",
          }
        : undefined;

  return (
    <div className="min-h-dvh pb-32">
      {selecting ? (
        <div className="surface-glass fixed inset-x-0 top-[var(--desktop-titlebar-height,0px)] z-40 flex h-[calc(52px+env(safe-area-inset-top))] items-center justify-between px-5 pt-[env(safe-area-inset-top)] md:hidden">
          <button type="button" onClick={clear} className="h-11 text-[15px]">
            Cancel
          </button>
          <span className="text-[15px] font-semibold">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => setSelected(new Set(entries.map(entryKey)))}
            className="h-11 text-[15px]"
          >
            Select all
          </button>
        </div>
      ) : null}
      <PageHeader
        title="Trash"
        crumbs={[{ label: "Trash" }]}
        className={cn(selecting && "max-md:invisible")}
        actions={[
          {
            label: "Empty trash",
            icon: Trash2,
            destructive: true,
            disabled: !entries.length,
            onSelect: () => setConfirm("empty"),
          },
        ]}
      />
      <PageColumn className="md:pt-10">
        <div className="flex items-end justify-between gap-4 px-1 pt-1 pb-4 max-md:px-4 md:pb-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] md:text-2xl md:leading-[30px] md:tracking-normal">
              Trash
            </h1>
            <p className="text-sm text-foreground-soft md:text-[13.5px] md:leading-5">
              Items are deleted for good after 30 days.
            </p>
          </div>
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => setConfirm("empty")}
              className="hidden h-8 shrink-0 rounded-lg px-2 text-[13px] text-foreground-soft transition-colors hover:text-foreground md:inline-flex md:items-center"
            >
              Empty trash
            </button>
          ) : null}
        </div>

        {loading && !data ? (
          <TrashSkeleton />
        ) : error && !data ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-[13.5px] text-muted-foreground">
            <p>Couldn't load Trash. {errorMessage(error)}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-foreground underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-28 text-center">
            <Trash2 aria-hidden="true" strokeWidth={1.5} className="size-6 text-muted-foreground" />
            <p className="text-[15px] font-medium">Trash is empty</p>
            <p className="max-w-xs text-[13.5px] text-muted-foreground">
              Files and notebooks you delete wait here for 30 days before they're gone for good.
            </p>
          </div>
        ) : (
          <>
            <ul
              className={cn(
                late && "enter-fade",
                "-mx-4 divide-y divide-border overflow-hidden border-y border-border md:mx-0 md:rounded-[10px] md:border",
              )}
            >
              {rows.map(({ key, item: entry, state }) => (
                <TrashRow
                  key={key}
                  entry={entry}
                  actions={actionsFor(
                    contextTargets(selected, entryKey(entry)).flatMap((key) => {
                      const target = entryByKey.get(key);
                      return target ? [target] : [];
                    }),
                  )}
                  presence={state}
                  notebook={
                    entry._tag === "file"
                      ? entry.file.folderIds
                          .map((id) => folderById.get(id))
                          .find((folder) => folder !== undefined)
                      : undefined
                  }
                  now={now}
                  selected={selected.has(entryKey(entry))}
                  selecting={selecting}
                  onToggle={toggle}
                  onOpenActions={openActions}
                  onRestore={requestRestore}
                  onPurge={requestPurge}
                />
              ))}
            </ul>
            <div className="flex justify-center py-[18px] md:hidden">
              <button
                type="button"
                onClick={() => setConfirm("empty")}
                className="h-11 text-[15px] text-destructive"
              >
                Empty trash
              </button>
            </div>
          </>
        )}
      </PageColumn>

      {dock.value !== null ? (
        <div
          role="toolbar"
          aria-label={`${dock.value} selected`}
          inert={dock.closing}
          className={cn(
            "fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 z-40 flex h-[52px] -translate-x-1/2 items-center gap-1 rounded-[26px] border border-sheet-border bg-[#181818]/90 pr-2 pl-[18px] backdrop-blur-md md:bottom-8 md:h-12 md:rounded-xl md:px-1.5",
            "transition-[opacity,translate] duration-moderate ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:transition-opacity motion-reduce:starting:translate-y-0",
            dock.closing && "translate-y-3 opacity-0 duration-popover motion-reduce:translate-y-0",
          )}
        >
          <span className="pr-2 text-sm font-semibold whitespace-nowrap md:px-3 md:pr-3 md:text-[13px]">
            {dock.value} selected
          </span>
          <span className="mx-1 h-5 w-px bg-border" />
          {selectionActions.map((action) => (
            <DockButton
              key={action.label}
              icon={action.icon!}
              label={action.label}
              danger={!!action.destructive}
              onClick={() => action.onSelect?.()}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border max-md:hidden" />
          <span className="max-md:hidden">
            <DockButton icon={X} label="Clear selection" onClick={clear} />
          </span>
        </div>
      ) : null}

      <Sheet
        open={sheetEntry !== undefined}
        onOpenChange={(open) => !open && setSheetEntry(undefined)}
      >
        <SheetContent side="bottom" className="gap-1 pb-[max(12px,env(safe-area-inset-bottom))]">
          <SheetTitle className="truncate px-5 pt-3 pb-1 text-base">
            {sheetEntry ? entryTitle(sheetEntry) : ""}
          </SheetTitle>
          <SheetDescription className="sr-only">Trash actions</SheetDescription>
          <div className="flex flex-col divide-y divide-border">
            {sheetActions.map((action) => {
              const Icon = action.icon!;
              return (
                <button
                  key={action.label}
                  type="button"
                  className={cn(
                    "flex h-12 items-center gap-3 px-5 text-[15px]",
                    action.destructive && "text-destructive",
                  )}
                  onClick={() => {
                    setSheetEntry(undefined);
                    action.onSelect?.();
                  }}
                >
                  <Icon className="size-[17px]" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirm !== undefined}
        onOpenChange={(open) => !open && setConfirm(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => {
                const target = confirm;
                setConfirm(undefined);
                if (target === "empty") void emptyTrash();
                else if (target) void purge(target.entries);
              }}
            >
              {confirmCopy?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TrashSkeleton() {
  return (
    <div className="-mx-4 divide-y divide-border overflow-hidden border-y border-border md:mx-0 md:rounded-[10px] md:border">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex min-h-[60px] items-center gap-3 px-5 md:min-h-12 md:px-4">
          <Skeleton className="size-4 rounded-[4px]" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function DockButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "motion-press inline-flex size-11 items-center justify-center rounded-full outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 md:size-9 md:rounded-lg [&_svg]:size-[17px] md:[&_svg]:size-4",
            danger ? "text-destructive" : "text-foreground-soft hover:text-foreground",
          )}
        >
          <Icon />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-md:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
