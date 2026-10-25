"use client";

import { useMemo, useState } from "react";
import type {
  FileId,
  FileKind,
  Folder,
  FolderId,
  IngestionJob,
  LibraryFile,
} from "@avenire/contracts";
import {
  ChevronDown,
  FileText,
  Globe,
  Image as ImageIcon,
  SquarePlay,
  type LucideIcon,
} from "lucide-react";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Chip } from "@avenire/ui/components/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@avenire/ui/components/popover";
import { useArrivedLate } from "@avenire/ui/components/presence";
import { cn } from "@avenire/ui/lib/utils";
import { KIND_LABELS, NotebookTag, RelativeTime, urlHost } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { FileRow } from "~/features/library/FileRow";
import { SourceUpload, SourceUploadArea } from "~/features/library/SourceUpload";
import { PresenceRows } from "~/features/library/PresenceRows";
import { NewNotebookDialog } from "~/features/library/NewNotebookDialog";
import { NotebookPicker } from "~/features/library/NotebookPicker";
import {
  KEPT_SOURCES,
  ingestionState,
  keepSource,
  type IngestionState,
} from "~/features/library/ingestion";
import type { Selection } from "~/features/library/useSelection";
import { useLocalSet } from "~/lib/localSet";
import { formatTimestamp } from "~/lib/time";
import { useNow } from "~/lib/useNow";
import { EmptyLine } from "./NotesTab";
import { ListSkeleton } from "./states";

export type SourceFilter = "all" | "unfiled" | "pdf" | "video" | "web" | "image";

const KIND_FILTERS: { value: SourceFilter; label: string; icon: LucideIcon; kinds: FileKind[] }[] =
  [
    { value: "pdf", label: "PDFs and documents", icon: FileText, kinds: ["pdf", "document"] },
    { value: "video", label: "Video and audio", icon: SquarePlay, kinds: ["video", "audio"] },
    { value: "web", label: "Web pages", icon: Globe, kinds: ["web-page", "selection"] },
    { value: "image", label: "Images", icon: ImageIcon, kinds: ["image"] },
  ];

export function parseSourceFilter(value: string | null): SourceFilter {
  return value === "unfiled" || KIND_FILTERS.some((filter) => filter.value === value)
    ? (value as SourceFilter)
    : "all";
}

export function matchesSourceFilter(file: LibraryFile, filter: SourceFilter) {
  if (filter === "all") return true;
  if (filter === "unfiled") return file.placement === "inbox";
  return KIND_FILTERS.find((item) => item.value === filter)!.kinds.includes(file.kind);
}

function sourceSubtitle(file: LibraryFile): string {
  const parts = [urlHost(file.sourceUrl) ?? KIND_LABELS[file.kind]];
  if (file.mediaPositionSec) parts.push(`saved at ${formatTimestamp(file.mediaPositionSec)}`);
  return parts.join(" · ");
}

const entryFileId = (entry: { readonly file: LibraryFile }) => entry.file.id;

const JUST_CAPTURED_MS = 3 * 60 * 60 * 1000;

/** Sources with filters, live ingestion and filing (05, 13b, 20 / M04, M05). */
export function SourcesTab({
  sources,
  folderById,
  selection,
  filter,
  onFilterChange,
  jobs,
  onRetry,
}: {
  sources: readonly LibraryFile[] | undefined;
  folderById: ReadonlyMap<FolderId, Folder>;
  selection: Selection;
  filter: SourceFilter;
  onFilterChange: (filter: SourceFilter) => void;
  jobs: ReadonlyMap<FileId, IngestionJob>;
  onRetry: (id: FileId) => void;
}) {
  const { actions } = useLibrary();
  const kept = useLocalSet(KEPT_SOURCES);
  const late = useArrivedLate(sources);
  const unfiledCount = sources?.filter((file) => file.placement === "inbox").length ?? 0;

  const groups = useMemo(() => {
    const processing: { file: LibraryFile; state: IngestionState }[] = [];
    const needsYou: { file: LibraryFile; state: IngestionState }[] = [];
    const rest: LibraryFile[] = [];
    for (const file of sources ?? []) {
      if (!matchesSourceFilter(file, filter)) continue;
      const state = ingestionState(jobs.get(file.id));
      if (state?.kind === "processing") processing.push({ file, state });
      else if (state && !(state.kind === "paywall" && kept.has(file.id)))
        needsYou.push({ file, state });
      else rest.push(file);
    }
    return { processing, needsYou, rest };
  }, [sources, filter, jobs, kept]);

  const now = useNow();
  const justCaptured =
    filter === "unfiled"
      ? groups.rest.filter((file) => now - Date.parse(file.createdAt) < JUST_CAPTURED_MS)
      : [];
  const earlier =
    filter === "unfiled" ? groups.rest.filter((file) => !justCaptured.includes(file)) : groups.rest;

  const renderRow = (file: LibraryFile) => (
    <SourceRow
      key={file.id}
      file={file}
      job={jobs.get(file.id)}
      folderById={folderById}
      selection={selection}
    />
  );

  return (
    <SourceUploadArea>
      <div className="flex items-center gap-3">
        <ScrollFade
          axis="x"
          className="-ml-4 flex min-w-0 items-center gap-2 overflow-x-auto pl-4 [scrollbar-width:none] md:ml-0 md:pl-0"
        >
          <FilterChip active={filter === "all"} onClick={() => onFilterChange("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "unfiled"} onClick={() => onFilterChange("unfiled")}>
            Unfiled <span className="text-muted-foreground">{unfiledCount}</span>
          </FilterChip>
          {KIND_FILTERS.map(({ value, label, icon: Icon }) => (
            <FilterChip
              key={value}
              active={filter === value}
              label={label}
              onClick={() => onFilterChange(value)}
            >
              <Icon strokeWidth={1.5} />
            </FilterChip>
          ))}
        </ScrollFade>
        <SourceUpload />
      </div>

      {sources === undefined ? (
        <ListSkeleton rows={5} />
      ) : (
        <div className={cn(late && "enter-fade", "flex flex-col gap-3")}>
          {groups.processing.length ? (
            <Group label={`Processing · ${groups.processing.length}`} flat>
              <PresenceRows items={groups.processing} getKey={entryFileId}>
                {({ file, state }) => {
                  return (
                    <FileRow
                      selection={selection}
                      key={file.id}
                      file={file}
                      className="md:px-0"
                      subtitle={state.kind === "processing" ? state.label : null}
                      below={<Sweep />}
                      selected={selection.has(file.id)}
                      selecting={selection.size > 0}
                      onToggle={selection.toggle}
                    />
                  );
                }}
              </PresenceRows>
            </Group>
          ) : null}

          {groups.needsYou.length ? (
            <Group label={`Needs you · ${groups.needsYou.length}`} flat>
              <PresenceRows items={groups.needsYou} getKey={entryFileId}>
                {({ file, state }) => {
                  const fix = needsYouCopy(file, state);
                  const primary = {
                    retry: { label: "Try again", run: () => onRetry(file.id) },
                    open: {
                      label: "Open in browser",
                      run: () =>
                        file.sourceUrl && window.open(file.sourceUrl, "_blank", "noopener"),
                    },
                  }[fix.primary];
                  const secondary =
                    fix.secondary === "keep"
                      ? { label: "Keep", run: () => keepSource(file.id) }
                      : { label: "Remove", run: () => void actions.trashFiles([file.id]) };
                  return (
                    <FileRow
                      selection={selection}
                      key={file.id}
                      file={file}
                      className="md:px-0"
                      subtitle={<span className={fix.tone}>{fix.reason}</span>}
                      trailing={
                        <span className="hidden items-center gap-5 text-[13px] md:flex">
                          <button
                            type="button"
                            className="font-semibold hover:underline"
                            onClick={primary.run}
                          >
                            {primary.label}
                          </button>
                          <button
                            type="button"
                            className="text-foreground-soft hover:text-foreground"
                            onClick={secondary.run}
                          >
                            {secondary.label}
                          </button>
                        </span>
                      }
                      actions={
                        <>
                          <button
                            type="button"
                            onClick={primary.run}
                            className="h-10 rounded-lg border border-input bg-surface-3 px-3.5 text-[15px]"
                          >
                            {primary.label}
                          </button>
                          <button
                            type="button"
                            onClick={secondary.run}
                            className="h-10 px-2 text-[15px] text-foreground-soft"
                          >
                            {secondary.label}
                          </button>
                        </>
                      }
                      selected={selection.has(file.id)}
                      selecting={selection.size > 0}
                      onToggle={selection.toggle}
                    />
                  );
                }}
              </PresenceRows>
            </Group>
          ) : null}

          {justCaptured.length ? (
            <Group label={`Just captured · ${justCaptured.length}`}>
              <PresenceRows items={justCaptured}>{renderRow}</PresenceRows>
            </Group>
          ) : null}
          {earlier.length ? (
            <Group label={justCaptured.length ? `Earlier · ${earlier.length}` : undefined}>
              <PresenceRows items={earlier}>{renderRow}</PresenceRows>
            </Group>
          ) : null}
          {groups.rest.length + groups.processing.length + groups.needsYou.length === 0 ? (
            <EmptyLine>
              {filter === "unfiled"
                ? "Nothing unfiled. Everything has a notebook."
                : filter === "all"
                  ? "No sources yet. Upload or drag and drop files, or capture a PDF, video or page on your computer."
                  : "No sources of this kind."}
            </EmptyLine>
          ) : null}
        </div>
      )}
    </SourceUploadArea>
  );
}

function needsYouCopy(file: LibraryFile, state: IngestionState) {
  const danger = "text-destructive/85";
  const warn = "text-warning";
  switch (state.kind) {
    case "password":
      return {
        reason: "Couldn't open it. The file is password-protected.",
        tone: danger,
        primary: "retry",
        secondary: "remove",
      } as const;
    case "paywall":
      return {
        reason: "Behind a paywall. Saved the title and abstract only.",
        tone: warn,
        primary: file.sourceUrl ? "open" : "retry",
        secondary: "keep",
      } as const;
    case "login":
      return {
        reason: `Needs your ${state.site ?? "site"} login. Capture it again on your computer with logged-in capture on.`,
        tone: warn,
        primary: file.sourceUrl ? "open" : "retry",
        secondary: "remove",
      } as const;
    case "paused":
      return {
        reason: "Paused. Ruth won't read it until you resume.",
        tone: "text-foreground-soft",
        primary: "retry",
        secondary: "remove",
      } as const;
    case "failed":
      return {
        reason: `Couldn't read it. ${state.reason}`,
        tone: danger,
        primary: "retry",
        secondary: "remove",
      } as const;
    default:
      return { reason: "", tone: "", primary: "retry", secondary: "remove" } as const;
  }
}

function Group({
  label,
  flat = false,
  children,
}: {
  label?: string | undefined;
  flat?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label ? <h3 className="text-[12.5px] text-muted-foreground">{label}</h3> : null}
      <div
        className={cn(
          "-mx-4 divide-y divide-border md:mx-0",
          flat
            ? "md:border-t md:border-border"
            : "md:overflow-hidden md:rounded-[10px] md:border md:border-border md:bg-card",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Sweep() {
  return (
    <span className="relative mt-1.5 block h-0.5 w-full max-w-[760px] overflow-hidden rounded-full bg-border">
      <span className="animate-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-foreground/80" />
    </span>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Chip asChild active={active}>
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={onClick}
        className="h-[34px] px-3.5 text-[13px] md:h-[26px] md:px-2.5 md:text-xs [&>svg]:size-3.5"
      >
        {children}
      </button>
    </Chip>
  );
}

function SourceRow({
  file,
  job,
  folderById,
  selection,
}: {
  file: LibraryFile;
  job?: IngestionJob | undefined;
  folderById: ReadonlyMap<FolderId, Folder>;
  selection: Selection;
}) {
  const notebooks = file.folderIds
    .map((id) => folderById.get(id))
    .filter((folder): folder is Folder => !!folder);
  return (
    <FileRow
      selection={selection}
      file={file}
      subtitle={[
        sourceSubtitle(file),
        job?.coverage?.status === "partial" ? "Limited coverage" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      aside={
        notebooks.length ? (
          <span className="flex min-w-0 items-center gap-2">
            <NotebookTag name={notebooks[0]!.name} color={notebooks[0]!.color} />
            {notebooks.length > 1 ? (
              <span className="text-xs text-muted-foreground">+{notebooks.length - 1}</span>
            ) : null}
          </span>
        ) : (
          <FileToNotebook fileId={file.id} />
        )
      }
      trailing={<RelativeTime iso={file.createdAt} className="md:w-16 md:text-right" />}
      selected={selection.has(file.id)}
      selecting={selection.size > 0}
      onToggle={selection.toggle}
    />
  );
}

/** "File to notebook…" on an unfiled row (desktop). */
function FileToNotebook({ fileId }: { fileId: FileId }) {
  const { folders, actions } = useLibrary();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex items-center gap-1 text-[12.5px] text-foreground-soft transition-colors hover:text-foreground">
          File to notebook…
          <ChevronDown className="size-3" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-1">
          <NotebookPicker
            title="Move to"
            folders={folders ?? []}
            onPick={(folder) => {
              setOpen(false);
              void actions.moveFiles([fileId], folder);
            }}
            onNew={() => {
              setOpen(false);
              setCreating(true);
            }}
          />
        </PopoverContent>
      </Popover>
      <NewNotebookDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(folder) => void actions.moveFiles([fileId], folder)}
      />
    </>
  );
}
