"use client";

import type { Folder, RuthThread } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { ArrowLeft, ChevronLeft, Ellipsis, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NotebookSwatch, ResponsiveDialog, glassButton } from "~/components/app";
import { HeaderNavigationItems, headerMenuButton } from "~/components/app/HeaderMenu";
import { DesktopTitlebar, useTitlebarSlots } from "~/features/desktop/titlebar";
import { useBack } from "~/lib/navigation";
import { useDocumentTitle } from "~/lib/document-title";

export interface ChatHeaderProps {
  readonly thread: RuthThread | undefined;
  readonly folder: Folder | undefined;
  readonly onRename: (title: string) => Promise<void>;
  readonly onFullAccess: (enabled: boolean) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}

/** Back + breadcrumb (notebook / thread title) with inline rename and a ⋯ menu. */
export function ChatHeader({ thread, folder, onRename, onFullAccess, onDelete }: ChatHeaderProps) {
  const back = useBack("/");
  const titlebar = useTitlebarSlots();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = thread?.title ?? "New chat";
  useDocumentTitle(title);

  const menu = (trigger: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Chat actions" className={trigger}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-mobile-sheet="true" className="w-72">
        <DropdownMenuItem disabled={!thread} onSelect={() => setTimeout(() => setEditing(true), 0)}>
          <PenLine />
          Rename
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={thread?.fullAccess ?? false}
          disabled={!thread}
          onCheckedChange={(checked) => void onFullAccess(checked === true)}
          className="h-auto min-h-14 items-start gap-2 py-2.5 pr-8 pl-2 [&>span:first-child]:top-3 [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
        >
          <ShieldCheck className="mt-0.5 size-3.5" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            <span className="text-[13px] font-medium leading-5">Full access</span>
            <span className="text-xs leading-4 text-muted-foreground">
              Apply file changes without asking
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!thread}
          variant="destructive"
          onSelect={() => setConfirmDelete(true)}
        >
          <Trash2 />
          Delete chat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <HeaderNavigationItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const titleView = editing ? (
    <RenameInput
      initial={title}
      onDone={async (next) => {
        setEditing(false);
        if (next && next !== title) await onRename(next);
      }}
    />
  ) : (
    <button
      type="button"
      onClick={() => thread && setEditing(true)}
      title="Rename"
      className="min-w-0 truncate rounded px-0.5 text-left font-semibold text-foreground"
    >
      {title}
    </button>
  );

  const breadcrumbs = (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="-ml-1.5 inline-flex h-8 shrink-0 items-center rounded-lg px-1.5 text-foreground-soft transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
      </button>
      {folder ? (
        <>
          <Link
            href={`/notebooks/${folder.id}`}
            className="flex min-w-0 shrink items-center gap-2 text-foreground-soft transition-colors hover:text-foreground"
          >
            <NotebookSwatch color={folder.color} />
            <span className="truncate">{folder.name}</span>
          </Link>
          <span className="text-muted-foreground">/</span>
        </>
      ) : null}
      <div className="flex min-w-0 items-center">{titleView}</div>
      {thread?.fullAccess ? (
        <span className="shrink-0 text-[12.5px] text-ruth-text">· Full access</span>
      ) : null}
    </nav>
  );

  return (
    <header className="relative z-30 shrink-0">
      {/* Desktop */}
      {titlebar ? (
        <DesktopTitlebar slots={titlebar} start={breadcrumbs} end={menu(headerMenuButton)} />
      ) : (
        <div data-desktop-header className="hidden h-14 items-center gap-2 px-6 md:flex">
          {breadcrumbs}
          <div className="ml-auto shrink-0">{menu(headerMenuButton)}</div>
        </div>
      )}

      {/* Phone: glass bar, back · title + notebook · ⋯ */}
      <div className="surface-glass flex h-[calc(52px+env(safe-area-inset-top))] items-center gap-2 px-4 pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex w-10 shrink-0">
          <button type="button" onClick={back} aria-label="Back" className={glassButton}>
            <ChevronLeft />
          </button>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-px text-center text-[16px] leading-5">
          <div className="flex max-w-full justify-center">{titleView}</div>
          {thread?.fullAccess ? (
            <span className="max-w-full truncate text-xs leading-4 text-muted-foreground">
              Full access
            </span>
          ) : null}
        </div>
        <div className="flex w-10 shrink-0 justify-end">{menu(glassButton)}</div>
      </div>

      <ResponsiveDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this chat?"
        description="The conversation is removed for good. Notes Ruth saved stay in your notebooks."
      >
        <div className="flex justify-end gap-2 px-5 pb-4 max-md:flex-col-reverse md:px-6 md:pb-6">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              void onDelete().finally(() => setDeleting(false));
            }}
          >
            Delete chat
          </Button>
        </div>
      </ResponsiveDialog>
    </header>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  readonly initial: string;
  readonly onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <input
      ref={input}
      value={value}
      aria-label="Chat title"
      maxLength={200}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(value.trim() || null);
        }
        if (event.key === "Escape") finish(null);
      }}
      className="h-7 w-[min(24rem,60vw)] rounded-md border border-input bg-transparent px-1.5 font-semibold text-foreground outline-none focus:border-ring/60"
    />
  );
}
