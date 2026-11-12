"use client";

import { useState } from "react";
import type { Folder, LibraryFile } from "@avenire/contracts";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { FileKindIcon, PageColumn, PageHeader, plural, urlHost } from "~/components/app";
import { useLibrary } from "~/features/library/LibraryProvider";
import { NotebookItemContextMenu } from "~/features/notebook/NotebookItemContextMenu";
import { addToLocalSet } from "~/lib/localSet";
import { errorMessage, useApi } from "~/lib/rpc";

/** Notebooks Ruth proposed that the user has already accepted (Keep doesn't clear `suggested`). */
export const REVIEWED_CLUSTERS = "avenire:reviewed-clusters";

/** 18c / M29: review Ruth's clusters as a plain list. Keep accepts, Skip dismisses. */
export function ClusterReview({ clusters }: { clusters: readonly Folder[] }) {
  const { files } = useLibrary();
  const api = useApi();
  const total = clusters.reduce((sum, folder) => sum + folder.sourceCount, 0);

  async function keepAll() {
    await Promise.all(clusters.map((folder) => keep(folder)));
  }

  async function keep(folder: Folder, name = folder.name) {
    try {
      await call(api, (client) => client["library.updateFolder"]({ folderId: folder.id, name }));
      addToLocalSet(REVIEWED_CLUSTERS, [folder.id]);
      invalidateLibrary(api, ["folders"]);
    } catch (cause) {
      toast.error(`Couldn't keep ${folder.name}: ${errorMessage(cause)}`);
    }
  }

  async function skip(folder: Folder, members: readonly LibraryFile[]) {
    try {
      // Take the sources out first: trashing a notebook trashes files that only live in it.
      await Promise.all(
        members.map((file) =>
          call(api, (client) =>
            client["library.placeFile"]({
              fileId: file.id,
              folderIds: file.folderIds.filter((id) => id !== folder.id),
            }),
          ),
        ),
      );
      await call(api, (client) => client["library.trashFolder"]({ folderId: folder.id }));
      addToLocalSet(REVIEWED_CLUSTERS, [folder.id]);
      invalidateLibrary(api);
    } catch (cause) {
      toast.error(`Couldn't skip ${folder.name}: ${errorMessage(cause)}`);
    }
  }

  return (
    <>
      <PageHeader
        backHref="/?tab=notebooks"
        title="Sort sources"
        subtitle={plural(total, "source")}
      />
      <PageColumn className="pt-4 pb-24 md:pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.01em]">
              Sort {plural(total, "unfiled source")}
            </h1>
            <p className="text-[13.5px] leading-5 text-foreground-soft">
              Ava grouped them overnight. Remove anything that doesn't belong. Nothing moves until
              you accept.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                void Promise.all(clusters.map((folder) => skip(folder, membersOf(folder, files))))
              }
            >
              Skip all
            </Button>
            <Button onClick={() => void keepAll()}>Accept all</Button>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-10">
          {clusters.map((folder) => (
            <ClusterGroup
              key={folder.id}
              folder={folder}
              members={membersOf(folder, files)}
              onKeep={(name) => void keep(folder, name)}
              onSkip={(members) => void skip(folder, members)}
            />
          ))}
          {clusters.length === 0 ? (
            <p className="text-[13.5px] text-muted-foreground">Nothing left to review.</p>
          ) : null}
        </div>
      </PageColumn>
    </>
  );
}

function membersOf(folder: Folder, files: readonly LibraryFile[] | undefined) {
  return (files ?? []).filter((file) => file.kind !== "note" && file.folderIds.includes(folder.id));
}

function ClusterGroup({
  folder,
  members,
  onKeep,
  onSkip,
}: {
  folder: Folder;
  members: readonly LibraryFile[];
  onKeep: (name: string) => void;
  onSkip: (members: readonly LibraryFile[]) => void;
}) {
  const api = useApi();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? members : members.slice(0, 4);

  async function remove(file: LibraryFile) {
    try {
      await call(api, (client) =>
        client["library.placeFile"]({
          fileId: file.id,
          folderIds: file.folderIds.filter((id) => id !== folder.id),
        }),
      );
      invalidateLibrary(api);
    } catch (cause) {
      toast.error(`Couldn't remove it: ${errorMessage(cause)}`);
    }
  }

  return (
    <section className="flex flex-col">
      <NotebookItemContextMenu folder={folder}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-2">
          <span className="text-[12.5px] text-muted-foreground">New notebook</span>
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                setRenaming(false);
                onKeep(name.trim());
              }}
            >
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-8 w-56"
              />
              <Button size="sm" type="submit">
                Save
              </Button>
            </form>
          ) : (
            <span className="text-[15px] font-semibold">{folder.name}</span>
          )}
          <span className="text-[12.5px] text-muted-foreground">
            {plural(members.length, "source")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onSkip(members)}>
              Skip
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="font-semibold text-foreground"
              onClick={() => onKeep(folder.name)}
            >
              Create
            </Button>
          </span>
        </div>
      </NotebookItemContextMenu>
      <ul className="divide-y divide-border border-y border-border">
        {shown.map((file) => (
          <li key={file.id} className="flex h-12 items-center gap-3 md:h-[38px]">
            <FileKindIcon kind={file.kind} url={file.sourceUrl} />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{file.title}</span>
            <span className="hidden text-[12.5px] text-muted-foreground md:inline">
              {urlHost(file.sourceUrl) ?? ""}
            </span>
            <button
              type="button"
              aria-label={`Remove ${file.title} from ${folder.name}`}
              onClick={() => void remove(file)}
              className="inline-flex size-11 items-center justify-center text-muted-foreground hover:text-foreground md:size-7"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {members.length > shown.length ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="h-9 self-start text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          {members.length - shown.length} more
        </button>
      ) : null}
    </section>
  );
}
