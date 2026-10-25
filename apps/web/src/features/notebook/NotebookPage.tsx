"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeleteNotebook } from "./useDeleteNotebook";
import { useCallback, useRef, useState } from "react";
import type { FileId, FolderId } from "@avenire/contracts";
import { Palette, Pencil, Search, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { PageColumn, PageHeader, type HeaderAction } from "~/components/app";
import { SearchResults } from "~/features/home/SearchResults";
import { useLibrary } from "~/features/library/LibraryProvider";
import { SelectionDock } from "~/features/library/SelectionDock";
import { useIngestionJobs } from "~/features/library/ingestion";
import { useSelection } from "~/features/library/useSelection";
import { CoverDialog } from "./CoverDialog";
import { NotebookComposer, type NotebookComposerHandle } from "./NotebookComposer";
import { NotebookTitle } from "./NotebookTitle";
import { NotesSection } from "./NotesSection";
import { SourcesSection } from "./SourcesSection";
import { ErrorRow } from "./parts";
import { useNotebook } from "./useNotebook";
import { useDocumentTitle } from "~/lib/document-title";

const NO_CONTEXT: readonly FileId[] = [];

/** A notebook: its notes and sources, with search and Ask Ruth scoped to it (07 / M09). */
export function NotebookPage({ folderId }: { folderId: FolderId }) {
  const notebook = useNotebook(folderId);
  const router = useRouter();
  const deletion = useDeleteNotebook(notebook.folder, () => router.push("/"));
  const library = useLibrary();
  const selection = useSelection();
  const composer = useRef<NotebookComposerHandle>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [scope, setScope] = useState<FolderId | null>(folderId);
  const [renaming, setRenaming] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { jobs } = useIngestionJobs(notebook.sources);
  const { folder, notes, sources } = notebook;
  useDocumentTitle(folder?.name ?? "Notebook");

  const createNote = useCallback(
    () => void library.actions.createNote([folderId]),
    [library.actions, folderId],
  );

  function search() {
    const text = draft.trim();
    if (text) setQuery(text);
  }

  function ask() {
    void library.actions.askRuth(draft, scope ? { folderId: scope } : undefined);
  }

  function clearSearch() {
    setQuery(null);
    selection.clear();
  }

  const actions: HeaderAction[] = folder
    ? [
        { label: "Search", icon: Search, pinned: true, onSelect: () => composer.current?.focus() },
        { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
        { label: "Change cover", icon: Palette, onSelect: () => setCoverOpen(true) },
        {
          label: "Delete notebook",
          icon: Trash2,
          destructive: true,
          onSelect: () => void deletion.requestDelete(),
        },
      ]
    : [];

  if (notebook.folderError)
    return (
      <>
        <PageHeader backHref="/" backLabel="Home" title="Notebook" />
        <PageColumn className="pt-16 md:pt-24">
          <NotFound error={notebook.folderError} onRetry={() => void notebook.refetchFolder()} />
        </PageColumn>
      </>
    );

  const selectableIds: FileId[] = query
    ? []
    : [...(notes ?? []), ...(sources ?? [])].map((file) => file.id);

  return (
    <>
      <PageHeader
        backHref="/"
        backLabel="Home"
        crumbs={folder ? [{ label: folder.name, color: folder.color }] : []}
        title=""
        actions={actions}
      />
      <PageColumn className="flex flex-col pt-2 pb-[calc(120px+env(safe-area-inset-bottom))] md:pt-8 md:pb-32">
        <NotebookTitle
          folder={folder}
          noteCount={notes?.length}
          sourceCount={sources?.length}
          renaming={renaming}
          onRenamingChange={setRenaming}
          onRename={(name) => void notebook.update({ name })}
          onChangeCover={() => setCoverOpen(true)}
        />

        {folder?.archivedAt ? (
          <div className="mt-6 flex items-center gap-3 border-l-2 border-input py-1 pl-3 text-[13px] text-foreground-soft">
            <span className="flex-1">This notebook is in the Trash.</span>
            <Button variant="secondary" onClick={() => void notebook.restore()}>
              Restore
            </Button>
          </div>
        ) : null}

        <div className="mt-10 max-md:mt-0">
          <NotebookComposer
            ref={composer}
            value={draft}
            onValueChange={setDraft}
            folders={library.folders ?? []}
            scope={scope}
            onScopeChange={setScope}
            onCreateNote={createNote}
            onSearch={search}
            onAsk={ask}
            onEscape={clearSearch}
            hidden={selection.size > 0}
          />
        </div>

        {query ? (
          <div className="mt-6 flex flex-col gap-3 md:mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold md:text-[13.5px] md:font-medium">Results</h2>
              <button
                type="button"
                onClick={clearSearch}
                className="-mr-2 h-11 px-2 text-[13px] text-muted-foreground hover:text-foreground md:h-8 md:text-xs"
              >
                Back to notebook
              </button>
            </div>
            <SearchResults
              query={query}
              scope={scope}
              context={NO_CONTEXT}
              files={library.files}
              folderById={library.folderById}
              selection={selection}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-8 md:mt-12 md:gap-12">
            {notebook.filesError ? (
              <ErrorRow error={notebook.filesError} onRetry={() => void notebook.refetchFiles()} />
            ) : null}
            <NotesSection selection={selection} notes={notes} onNewNote={createNote} />
            <SourcesSection
              sources={sources}
              jobs={jobs}
              expanded={expanded}
              onExpandedChange={setExpanded}
              selection={selection}
            />
          </div>
        )}
      </PageColumn>

      {deletion.dialog}
      <SelectionDock selection={selection} allIds={query ? [...selection.ids] : selectableIds} />

      {folder ? (
        <CoverDialog
          folder={folder}
          open={coverOpen}
          onOpenChange={setCoverOpen}
          onSave={(patch) => void notebook.update(patch)}
        />
      ) : null}
    </>
  );
}

function NotFound({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const missing = (error as { _tag?: string } | undefined)?._tag === "NotFound";
  if (!missing) return <ErrorRow error={error} onRetry={onRetry} />;
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[15px] font-semibold">This notebook isn't here</p>
      <p className="text-[13.5px] text-foreground-soft">It may have been deleted for good.</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "mt-2" })}>
        Back to Home
      </Link>
    </div>
  );
}
