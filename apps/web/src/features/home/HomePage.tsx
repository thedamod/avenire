"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { FileId, FolderId } from "@avenire/contracts";
import { HeaderMenu, headerMenuButton } from "~/components/app/HeaderMenu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@avenire/ui/components/tabs";
import { PageColumn, glassButton, plural } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { NewNotebookDialog } from "~/features/library/NewNotebookDialog";
import { SelectionDock } from "~/features/library/SelectionDock";
import { useIngestionJobs } from "~/features/library/ingestion";
import { useSelection } from "~/features/library/useSelection";
import { DesktopTitlebar, useTitlebarSlots } from "~/features/desktop/titlebar";
import { ActivityList } from "~/features/tasks/ActivityList";
import { useActivity } from "~/features/tasks/activity";
import { ScheduleTaskDialog } from "~/features/tasks/ScheduleTaskDialog";
import { useLocalSet } from "~/lib/localSet";
import { ClusterReview, REVIEWED_CLUSTERS } from "./ClusterReview";
import { FirstRunSteps } from "./FirstRunSteps";
import { HomeComposer } from "./HomeComposer";
import { MorningToast } from "./MorningToast";
import { NotebookShelf } from "./NotebookShelf";
import { NotesTab } from "./NotesTab";
import { SearchResults } from "./SearchResults";
import {
  SourcesTab,
  matchesSourceFilter,
  parseSourceFilter,
  type SourceFilter,
} from "./SourcesTab";
import { ErrorRow, ListSkeleton } from "./states";

type HomeTab = "notebooks" | "notes" | "sources";

function parseTab(value: string | null): HomeTab {
  return value === "notes" || value === "sources" ? value : "notebooks";
}

export function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const tab = parseTab(params.get("tab"));
  const filter = parseSourceFilter(params.get("filter"));
  const reviewing = params.get("review") === "clusters";

  const { folders, files, folderById, error, refetch, actions } = useLibrary();
  const activity = useActivity("home");
  const { jobs, retry } = useIngestionJobs(files);
  const selection = useSelection();
  const reviewed = useLocalSet(REVIEWED_CLUSTERS);
  const titlebar = useTitlebarSlots();

  const [text, setText] = useState(query);
  const [scope, setScope] = useState<FolderId | null>(
    (params.get("in") as FolderId | null) ?? null,
  );
  const [context, setContext] = useState<FileId[]>([]);
  const [creatingNotebook, setCreatingNotebook] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Keep the field in step with back/forward through searches, and drop the selection when
  // the list under it changes.
  const view = `${tab}|${filter}|${query}`;
  const [lastView, setLastView] = useState(view);
  if (lastView !== view) {
    setLastView(view);
    setText(query);
    if (selection.size) selection.clear();
  }

  const notes = useMemo(
    () =>
      files
        ?.filter((file) => file.kind === "note")
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [files],
  );
  const sources = useMemo(() => files?.filter((file) => file.kind !== "note"), [files]);
  const clusters = useMemo(
    () => (folders ?? []).filter((folder) => folder.suggested && !reviewed.has(folder.id)),
    [folders, reviewed],
  );

  const setParams = useCallback(
    (next: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) search.delete(key);
        else search.set(key, value);
      }
      const url = search.size ? `${pathname}?${search.toString()}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router],
  );

  const search = () => {
    const value = text.trim();
    if (!value) return;
    setParams({ q: value, in: scope }, query ? "replace" : "push");
  };
  const ask = () => void actions.askRuth(text, { folderId: scope ?? undefined, fileIds: context });
  const escape = () => {
    setText("");
    if (query) setParams({ q: null, in: null });
  };

  if (reviewing) return <ClusterReview clusters={clusters} />;

  const loaded = folders !== undefined && files !== undefined;
  const firstRun = loaded && folders.length === 0 && files.length === 0;
  const visibleIds: FileId[] =
    tab === "notes"
      ? (notes ?? []).map((file) => file.id)
      : (sources ?? []).filter((file) => matchesSourceFilter(file, filter)).map((file) => file.id);

  return (
    <main className="pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-24">
      {/* Phone header */}
      <header className="flex h-[calc(48px+env(safe-area-inset-top))] items-center justify-between pt-[env(safe-area-inset-top)] pr-4 pl-5 md:hidden">
        {query ? (
          <>
            <span className="text-[15px] font-semibold">Search</span>
            <button
              type="button"
              onClick={escape}
              className="h-11 text-[15px] text-foreground-soft"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">Avenire</span>
            <HomeMenu onSchedule={() => setScheduling(true)} />
          </>
        )}
      </header>
      {titlebar ? (
        // No crumbs at the root: the quiet wordmark mirrors the phone header.
        <DesktopTitlebar
          slots={titlebar}
          start={<span className="truncate font-medium text-foreground-soft">Avenire</span>}
          end={<HomeMenu onSchedule={() => setScheduling(true)} className={headerMenuButton} />}
        />
      ) : (
        <div data-desktop-header className="fixed top-4 right-5 z-20 hidden md:block">
          <HomeMenu onSchedule={() => setScheduling(true)} />
        </div>
      )}

      <PageColumn className="flex flex-col pt-2 md:pt-[104px]">
        <HomeComposer
          value={text}
          onValueChange={setText}
          folders={folders ?? []}
          scope={scope}
          onScopeChange={setScope}
          files={files ?? []}
          context={context}
          onContextChange={setContext}
          onSearch={search}
          onAsk={ask}
          onEscape={escape}
          hidden={selection.size > 0}
        />

        {query ? (
          <div className="mt-5 md:mt-6">
            <SearchResults
              query={query}
              scope={(params.get("in") as FolderId | null) ?? null}
              context={context}
              files={files}
              folderById={folderById}
              selection={selection}
            />
          </div>
        ) : (
          <>
            <div className="mt-2 md:mt-5 md:empty:hidden">
              <MorningToast runs={activity.runs.data} />
            </div>
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setParams({ tab: value === "notebooks" ? null : value, filter: null })
              }
              className="mt-5 gap-4 md:mt-7 md:gap-5"
            >
              <TabsList className="-mx-4 w-auto gap-[22px] px-4 md:mx-0 md:gap-6 md:px-0">
                <HomeTabTrigger value="notebooks" label="Notebooks" count={folders?.length} />
                <HomeTabTrigger value="notes" label="Notes" count={notes?.length} />
                <HomeTabTrigger value="sources" label="Sources" count={sources?.length} />
              </TabsList>
              {error && !loaded ? <ErrorRow error={error} onRetry={refetch} /> : null}
              <TabsContent value="notebooks" className="flex flex-col gap-4">
                {clusters.length ? (
                  <div className="flex items-center gap-3 border-l-2 border-ruth-line py-1 pl-3 text-[13px]">
                    <span className="min-w-0 flex-1 text-foreground-soft">
                      Ava grouped your unfiled sources into{" "}
                      {plural(clusters.length, "new notebook")}.
                    </span>
                    <Link
                      href="/?review=clusters"
                      className="shrink-0 font-semibold hover:underline"
                    >
                      Review
                    </Link>
                  </div>
                ) : null}
                <NotebookShelf
                  folders={folders}
                  onNew={() => setCreatingNotebook(true)}
                  after={firstRun ? <FirstRunSteps /> : null}
                />
              </TabsContent>
              <TabsContent value="notes">
                <NotesTab
                  notes={notes}
                  folderById={folderById}
                  selection={selection}
                  onNewNote={() => void actions.createNote()}
                />
              </TabsContent>
              <TabsContent value="sources">
                <SourcesTab
                  sources={sources}
                  folderById={folderById}
                  selection={selection}
                  filter={filter}
                  onFilterChange={(next: SourceFilter) =>
                    setParams({ filter: next === "all" ? null : next })
                  }
                  jobs={jobs}
                  onRetry={(id) => void retry(id)}
                />
              </TabsContent>
            </Tabs>

            <section className="mt-10 flex flex-col gap-3 md:mt-12">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-semibold md:text-[13.5px]">Chats and Tasks</h2>
                <Link
                  href="/tasks"
                  className="text-[15px] text-muted-foreground hover:text-foreground md:text-[12.5px]"
                >
                  See all
                </Link>
              </div>
              {activity.items === undefined ? (
                activity.error ? (
                  <ErrorRow error={activity.error} onRetry={activity.refetch} />
                ) : (
                  <ListSkeleton rows={3} />
                )
              ) : activity.items.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-input px-5 py-8 text-center">
                  <p className="text-[13.5px] text-foreground-soft">No chats or tasks yet.</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Ask Ava something above, or leave her a task to do overnight.
                  </p>
                </div>
              ) : (
                <ActivityList items={activity.items.slice(0, 5)} folderById={folderById} />
              )}
            </section>
          </>
        )}
      </PageColumn>

      <SelectionDock
        selection={selection}
        noun={tab === "notes" && !query ? "note" : query ? "file" : "source"}
        allIds={visibleIds}
      />
      <NewNotebookDialog open={creatingNotebook} onOpenChange={setCreatingNotebook} />
      <ScheduleTaskDialog
        open={scheduling}
        onOpenChange={setScheduling}
        onSaved={activity.refetch}
      />
    </main>
  );
}

function HomeTabTrigger({
  value,
  label,
  count,
}: {
  value: HomeTab;
  label: string;
  count: number | undefined;
}) {
  return (
    <TabsTrigger value={value} className="gap-1.5 text-[15px] md:text-[13.5px]">
      {label}
      <span className="text-[13px] font-normal text-muted-foreground md:text-xs">
        {count ?? ""}
      </span>
    </TabsTrigger>
  );
}

function HomeMenu({
  onSchedule,
  className = `${glassButton} md:size-8 md:border-transparent md:bg-transparent md:backdrop-blur-none md:hover:bg-hover`,
}: {
  onSchedule: () => void;
  className?: string;
}) {
  return (
    <HeaderMenu
      className={className}
      actions={[{ label: "New overnight task", onSelect: onSchedule }]}
    />
  );
}
