"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { FileId, Folder } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { ExternalLink, FolderInput, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { PageColumn, PageHeader, ResponsiveDialog, type HeaderAction } from "~/components/app";
import { ErrorRow } from "~/features/home/states";
import { useLibrary } from "~/features/library/LibraryProvider";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { useBack } from "~/lib/navigation";
import { parseCitation } from "./citation";
import { MoveToNotebook } from "./MoveToNotebook";
import { hasOriginal } from "./reopen";
import { useIsDesktop, useReopenFile } from "./useReopenFile";
import { SourceViewerBody } from "./SourceViewer";
import { ViewerLoading } from "./ViewerLoading";
import { isJsonOutput } from "~/features/report/logic/report";
import { useQuizFiles } from "~/features/report/useReport";
import { Skeleton } from "@avenire/ui/components/skeleton";
import { cn } from "@avenire/ui/lib/utils";
import { useDocumentTitle } from "~/lib/document-title";

const QuizPane = dynamic(() => import("~/features/report/panes/QuizPane"), { ssr: false });

/** `/sources/[fileId]?page=&t=&region=&q=`: a source on its own page (14a–c, 20 / M18–M20). */
export function SourcePage({ fileId }: { fileId: FileId }) {
  const api = useApi();
  const library = useLibrary();
  const params = useSearchParams();
  const target = useMemo(() => parseCitation(new URLSearchParams(params.toString())), [params]);
  const file = useQuery(
    (client) => client["library.getFile"]({ fileId }),
    `source-files-${fileId}`,
  );
  const [moving, setMoving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const data = file.data;
  useDocumentTitle(data?.title ?? "Source");
  const quizCandidate = data ? isJsonOutput(data) : false;
  // PDFs (and the wait before the kind is known) take the whole viewport under the header, like
  // v1's document canvas; every other kind keeps the reading column.
  const stage = !data || (data.kind === "pdf" && !quizCandidate);
  const quizzes = useQuizFiles(quizCandidate ? [fileId] : []);
  const fileById = useMemo(
    () => new Map((library.files ?? []).map((item) => [item.id, item] as const)),
    [library.files],
  );

  const notebooks = (data?.folderIds ?? [])
    .map((id) => library.folderById.get(id))
    .filter((folder): folder is Folder => !!folder && folder.archivedAt === null);
  const home = notebooks[0] ? `/notebooks/${notebooks[0].id}` : "/";
  const back = useBack(home);
  const desktop = useIsDesktop();
  const reopen = useReopenFile();

  async function rename(title: string) {
    if (!data || title === data.title) return;
    const before = data;
    file.setData({ ...data, title });
    try {
      file.setData(await call(api, (client) => client["library.renameFile"]({ fileId, title })));
    } catch (cause) {
      file.setData(before);
      toast.error(`Couldn't rename: ${errorMessage(cause)}`);
    } finally {
      invalidateLibrary(api, ["files"]);
    }
  }

  async function trash() {
    await library.actions.trashFiles([fileId]);
    back();
  }

  const menu: HeaderAction[] = [
    ...(data && hasOriginal(data, desktop)
      ? [
          {
            label: "Open original",
            icon: ExternalLink,
            pinned: true,
            onSelect: () => reopen(data),
          },
        ]
      : []),
    { label: "Move to notebook", icon: FolderInput, onSelect: () => setMoving(true) },
    { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
    { label: "Move to Trash", icon: Trash2, destructive: true, onSelect: () => void trash() },
  ];

  if (file.error && !data)
    return (
      <>
        <PageHeader backHref="/" title="Source" />
        <PageColumn className="pt-16 md:pt-24">
          {(file.error as { _tag?: string })._tag === "NotFound" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[15px] font-semibold">This source isn't here</p>
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
            <ErrorRow error={file.error} onRetry={() => void file.refetch()} />
          )}
        </PageColumn>
      </>
    );

  return (
    <>
      <div className={cn(stage && "flex h-dvh flex-col overflow-hidden")}>
        <PageHeader
          className={cn(stage && "shrink-0")}
          backHref={home}
          backLabel={notebooks[0]?.name ?? "Home"}
          crumbs={[
            ...(notebooks[0]
              ? [{ label: notebooks[0].name, href: home, color: notebooks[0].color }]
              : []),
            { label: data?.title ?? "" },
          ]}
          title={data?.title ?? ""}
          actions={data ? menu : []}
        />

        {stage ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {data ? <SourceViewerBody file={data} {...target} /> : <ViewerLoading />}
          </div>
        ) : (
          <PageColumn className="flex flex-col gap-5 pt-3 pb-[calc(40px+env(safe-area-inset-bottom))] md:gap-6 md:pt-8 md:pb-24">
            {data ? (
              quizCandidate && !quizzes.has(fileId) ? (
                <div className="flex flex-col gap-4 px-5 pt-2 md:px-7 md:pt-4">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-6 w-5/6" />
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-[46px] rounded-lg" />
                  ))}
                </div>
              ) : quizzes.get(fileId) ? (
                <QuizPane
                  key={fileId}
                  fileId={fileId}
                  quiz={quizzes.get(fileId)}
                  fileById={fileById}
                  runId={`source:${fileId}`}
                  onAskRuth={(text) => void library.actions.askRuth(text, { fileIds: [fileId] })}
                />
              ) : (
                <SourceViewerBody file={data} {...target} />
              )
            ) : null}
          </PageColumn>
        )}
      </div>

      <MoveToNotebook
        open={moving}
        onOpenChange={setMoving}
        title="Move source to"
        onPick={(folder) => void library.actions.moveFiles([fileId], folder)}
      />
      {data ? (
        <RenameDialog
          open={renaming}
          onOpenChange={setRenaming}
          initial={data.title}
          onRename={(title) => void rename(title)}
        />
      ) : null}
    </>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  initial,
  onRename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  onRename: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(initial);
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename source"
      className="max-w-[420px] sm:max-w-[420px]"
    >
      <form
        className="flex flex-col gap-4 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:px-6 md:pt-3 md:pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          const title = value.trim();
          if (!title) return;
          onOpenChange(false);
          onRename(title);
        }}
      >
        <Input
          autoFocus
          value={value}
          maxLength={200}
          aria-label="Title"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 md:h-9"
        />
        <div className="flex flex-col gap-2 md:flex-row md:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="hidden md:inline-flex"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!value.trim()} className="h-11 md:h-8">
            Rename
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
