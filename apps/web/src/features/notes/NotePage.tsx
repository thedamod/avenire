"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { FileId, Folder, LibraryFile, NoteContent } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { FolderInput, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import {
  NotebookSwatch,
  PageColumn,
  PageHeader,
  plural,
  type HeaderAction,
} from "~/components/app";
import {
  CompactComposer,
  type CompactComposerSubmission,
} from "~/features/chat/composer/CompactComposer";
import { useKeyboardInset } from "~/features/chat/composer/useKeyboardInset";
import { useLibrary } from "~/features/library/LibraryProvider";
import { ErrorRow } from "~/features/home/states";
import { MoveToNotebook } from "~/features/sources/MoveToNotebook";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { useIsMobile } from "~/lib/responsive";
import { relativeLabel } from "~/lib/time";
import { useNow } from "~/lib/useNow";
import type { NoteEditorHandle } from "./NoteEditor";
import { NoteBodySkeleton } from "./NoteBodySkeleton";
import { citedSourceCount } from "./provenance";
import { useNoteAutosave, type SaveStatus } from "./useNoteAutosave";
import { useDocumentTitle } from "~/lib/document-title";

const NoteEditor = dynamic(() => import("./NoteEditor"), {
  ssr: false,
  loading: () => <NoteBodySkeleton />,
});

/** The note editor (11 / M10): title, provenance line, the markdown body and a compact composer. */
export function NotePage({ fileId }: { fileId: FileId }) {
  const api = useApi();
  const router = useRouter();
  const library = useLibrary();
  const isMobile = useIsMobile();
  const file = useQuery((client) => client["library.getFile"]({ fileId }), `note-files-${fileId}`);
  const [note, setNote] = useState<NoteContent | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [cited, setCited] = useState(0);
  const editor = useRef<NoteEditorHandle | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const titleValue = useRef("");
  const lastMarkdown = useRef("");
  titleValue.current = title;

  const read = useCallback(() => {
    if (!editor.current) return null;
    try {
      lastMarkdown.current = editor.current.getMarkdown();
    } catch {
      // Editor already torn down (route change): use the last text we read.
    }
    return { title: titleValue.current, markdown: lastMarkdown.current };
  }, []);

  const autosave = useNoteAutosave({ fileId, read });
  const { reset } = autosave;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await call(api, (client) => client["library.getNote"]({ fileId }));
      lastMarkdown.current = loaded.markdown;
      setNote(loaded);
      setTitle(loaded.title === "Untitled" && !loaded.markdown.trim() ? "" : loaded.title);
      setCited(citedSourceCount(loaded.markdown));
      reset(loaded);
    } catch (cause) {
      setLoadError(cause);
    }
  }, [api, fileId, reset]);

  useEffect(() => {
    void load();
    void call(api, (client) => client["library.recordFileEvent"]({ fileId, kind: "opened" })).catch(
      () => {},
    );
  }, [api, fileId, load]);

  // A brand-new note starts in the title.
  useEffect(() => {
    if (note && !title && !note.markdown.trim()) titleRef.current?.focus();
    // Only when the note first loads.
  }, [note]);

  const folder: Folder | undefined = file.data?.folderIds
    .map((id) => library.folderById.get(id))
    .find((value): value is Folder => !!value && value.archivedAt === null);
  const backHref = folder ? `/notebooks/${folder.id}` : "/";
  const displayTitle = title.trim() || "Untitled";
  useDocumentTitle(displayTitle);

  async function reloadLatest() {
    try {
      const latest = await autosave.reload();
      lastMarkdown.current = latest.markdown;
      setTitle(latest.title);
      setCited(citedSourceCount(latest.markdown));
      editor.current?.setMarkdown(latest.markdown);
    } catch (cause) {
      toast.error(`Couldn't reload: ${errorMessage(cause)}`);
    }
  }

  async function trash() {
    await autosave.flush();
    await library.actions.trashFiles([fileId]);
    router.push(backHref);
  }

  async function ask(input: CompactComposerSubmission): Promise<boolean> {
    const text = input.text.trim();
    if (!text) return false;
    try {
      await autosave.flush();
      const folderId = input.scope.folderIds?.[0] ?? folder?.id;
      const thread = await call(api, (client) =>
        client["ruth.createThread"]({
          title: text.slice(0, 120),
          ...(folderId ? { folderId } : {}),
        }),
      );
      invalidateLibrary(api, ["threads"]);
      const params = new URLSearchParams({ q: text });
      if (input.scope.fileIds?.length) params.set("files", input.scope.fileIds.join(","));
      if (input.fast) params.set("fast", "1");
      router.push(`/chat/${thread.id}?${params.toString()}`);
      return true;
    } catch (cause) {
      toast.error(`Couldn't reach Ava: ${errorMessage(cause)}`);
      return false;
    }
  }

  const menu: HeaderAction[] = [
    { label: "Rename", icon: Pencil, onSelect: () => titleRef.current?.focus() },
    { label: "Move to notebook", icon: FolderInput, onSelect: () => setMoving(true) },
    { label: "Move to Trash", icon: Trash2, destructive: true, onSelect: () => void trash() },
  ];

  if (loadError)
    return (
      <>
        <PageHeader backHref={backHref} backLabel="Back" title="Note" />
        <PageColumn width={720} className="pt-16 md:pt-24">
          {(loadError as { _tag?: string })._tag === "NotFound" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[15px] font-semibold">This note isn't here</p>
              <p className="text-[13.5px] text-foreground-soft">
                It may be in the Trash or deleted for good.
              </p>
              <Link
                href="/"
                className={buttonVariants({ variant: "secondary", className: "mt-2" })}
              >
                Back to Home
              </Link>
            </div>
          ) : (
            <ErrorRow error={loadError} onRetry={() => void load()} />
          )}
        </PageColumn>
      </>
    );

  return (
    <>
      <PageHeader
        backHref={backHref}
        backLabel={folder?.name ?? "Home"}
        crumbs={[
          ...(folder ? [{ label: folder.name, href: backHref, color: folder.color }] : []),
          { label: displayTitle },
        ]}
        title=""
        actions={note ? menu : []}
      />

      <PageColumn
        width={720}
        className="flex flex-col pt-1 pb-[calc(140px+env(safe-area-inset-bottom))] md:pt-10 md:pb-44"
      >
        {folder ? (
          <Link
            href={backHref}
            className="flex w-fit items-center gap-1.5 pb-2 text-[13px] leading-[18px] text-foreground-soft md:hidden"
          >
            <NotebookSwatch color={folder.color} />
            {folder.name}
          </Link>
        ) : null}

        {note ? (
          <TitleField
            ref={titleRef}
            value={title}
            onChange={(value) => {
              setTitle(value);
              autosave.touch();
            }}
            onFocus={() => setEditing(true)}
            onBlur={() => {
              setEditing(false);
              void autosave.flush();
            }}
            onEnter={() => editor.current?.focus("start")}
          />
        ) : (
          <Skeleton className="h-8 w-3/5 md:h-11" />
        )}

        <MetaLine file={file.data} cited={cited} status={autosave.status} error={autosave.error} />

        {autosave.status === "conflict" ? (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-warning/70 py-1 pl-3 text-[13.5px]"
          >
            <span className="min-w-0 flex-1 text-foreground">
              This note changed elsewhere.{" "}
              <span className="text-foreground-soft">Your edits since then aren't saved yet.</span>
            </span>
            <span className="flex gap-2">
              <Button
                variant="secondary"
                className="max-md:h-10"
                onClick={() => void reloadLatest()}
              >
                Reload
              </Button>
              <Button
                variant="ghost"
                className="max-md:h-10"
                onClick={() => void autosave.keepMine()}
              >
                Keep mine
              </Button>
            </span>
          </div>
        ) : null}

        <div className="mt-6 md:mt-9">
          {note ? (
            <NoteEditor
              initialMarkdown={note.markdown}
              onChange={autosave.touch}
              onFocus={() => setEditing(true)}
              onBlur={() => {
                setEditing(false);
                void autosave.flush();
              }}
              onReady={(handle) => {
                editor.current = handle;
              }}
            />
          ) : (
            <NoteBodySkeleton />
          )}
        </div>
      </PageColumn>

      <NoteComposerDock hidden={isMobile && editing}>
        <CompactComposer
          draftKey={`note:${fileId}`}
          placeholder="Ask about this note, or tell Ava what to add"
          scope={{ fileIds: [fileId] }}
          scopeLabel="This note"
          onSubmit={ask}
        />
      </NoteComposerDock>

      <MoveToNotebook
        open={moving}
        onOpenChange={setMoving}
        title="Move note to"
        fileId={fileId}
        onPick={(target) => void library.actions.moveFiles([fileId], target)}
      />
    </>
  );
}

/**
 * Pins the compact composer to the bottom: 736 wide on desktop; on phone it rides above the
 * keyboard and steps aside while the note itself is being edited, so it never covers the caret.
 */
function NoteComposerDock({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const inset = useKeyboardInset();
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-background px-3 pt-3 pb-[calc(10px+env(safe-area-inset-bottom))] transition-opacity duration-popover ease-out md:px-6 md:pb-5",
        hidden && "pointer-events-none invisible opacity-0",
      )}
      style={inset ? { bottom: inset, paddingBottom: 8 } : undefined}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[736px]">{children}</div>
    </div>
  );
}

function TitleField({
  ref,
  value,
  onChange,
  onFocus,
  onBlur,
  onEnter,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnter: () => void;
}) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={200}
      placeholder="Untitled"
      aria-label="Title"
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter();
        }
      }}
      className="block w-full resize-none overflow-hidden bg-transparent text-[26px] max-md:text-[26px]! leading-8 font-semibold tracking-[-0.02em] text-foreground caret-ruth outline-none placeholder:text-muted-foreground md:text-[36px] md:leading-[44px]"
    />
  );
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  conflict: "Not saved",
  error: "Couldn't save",
};

/** "Written by Ruth overnight · edited by you 2h ago · 3 sources · Saved". */
function MetaLine({
  file,
  cited,
  status,
  error,
}: {
  file: LibraryFile | undefined;
  cited: number;
  status: SaveStatus;
  error: string | null;
}) {
  const now = useNow();
  if (!file) return <Skeleton className="mt-2.5 h-3 w-64" />;
  const by =
    file.source === "ruth-cloud"
      ? "Written by Ava overnight"
      : file.source === "ruth"
        ? "Written by Ava"
        : file.source === "chat"
          ? "Saved from a chat"
          : "Your note";
  const edited = file.contentModifiedAt
    ? `edited ${file.source === "user" ? "" : "by you "}${relativeLabel(file.contentModifiedAt, "precise", new Date(now)).toLowerCase()}`
    : null;
  const parts = [by, edited, cited ? plural(cited, "source") : null].filter(Boolean);
  return (
    <p className="pt-1.5 text-xs leading-4 text-muted-foreground md:pt-2.5">
      {parts.join(" · ")}
      {" · "}
      <span
        key={status}
        aria-live="polite"
        className={cn("enter-fade", status === "error" && "text-destructive/85")}
        title={error ?? undefined}
      >
        {SAVE_LABELS[status]}
      </span>
    </p>
  );
}
