"use client";

import type { Folder, FolderId } from "@avenire/contracts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { cn } from "@avenire/ui/lib/utils";
import { ArrowUp, Check, ChevronDown, Clock, Library, Moon, Square, Zap } from "lucide-react";
import { NotebookSwatch } from "~/components/app";

const control =
  "inline-flex h-8 min-w-0 items-center gap-1.5 [&_svg]:shrink-0 rounded-lg px-2 text-[13px] text-foreground-soft transition-colors hover:bg-hover hover:text-foreground data-[state=open]:bg-hover data-[state=open]:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function ControlDivider() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-border" />;
}

/** Ruth vs Ruth Fast (a lighter model and a shorter tool budget). */
export function RuthModelMenu({
  fast,
  onFastChange,
  open,
  onOpenChange,
}: {
  readonly fast: boolean;
  readonly onFastChange: (fast: boolean) => void;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} {...(open === undefined ? {} : { open, onOpenChange })}>
      <DropdownMenuTrigger className={control} aria-label="Ruth mode">
        {fast ? <Zap className="size-3.5" /> : <Moon className="size-3.5" />}
        <span>{fast ? "Fast" : "Ruth"}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {(
          [
            [false, "Ruth", "Searches your material and explains in depth", Moon],
            [true, "Ruth Fast", "Quicker answers with fewer tools", Zap],
          ] as const
        ).map(([value, label, detail, Icon]) => (
          <DropdownMenuItem
            key={label}
            onSelect={() => onFastChange(value)}
            className="h-auto items-start gap-2.5 py-2"
          >
            <Icon className="mt-0.5 size-3.5" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">{detail}</span>
            </span>
            {fast === value ? <Check className="mt-0.5 size-3.5 text-ruth" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Which notebook Ruth searches by default (ChatScope.folderIds); "All notebooks" = no scope. */
export function ScopePicker({
  folderId,
  folders,
  onChange,
  thisNoteLabel,
  open,
  onOpenChange,
}: {
  readonly folderId: FolderId | null;
  readonly folders: readonly Folder[];
  readonly onChange: (folderId: FolderId | null) => void;
  /** Compact composer on a note: label for the "This note" scope shown when folderId is null. */
  readonly thisNoteLabel?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const current = folderId ? folders.find((folder) => folder.id === folderId) : undefined;
  return (
    <DropdownMenu modal={false} {...(open === undefined ? {} : { open, onOpenChange })}>
      <DropdownMenuTrigger className={cn(control, "max-w-48")} aria-label="Search scope">
        {current ? <NotebookSwatch color={current.color} /> : <Library className="size-3.5" />}
        <span className="truncate">{current?.name ?? thisNoteLabel ?? "All notebooks"}</span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-80 w-60">
        <DropdownMenuLabel>Ruth searches</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <Library className="size-3.5" />
          <span className="flex-1">{thisNoteLabel ?? "All notebooks"}</span>
          {folderId === null ? <Check className="size-3.5 text-ruth" /> : null}
        </DropdownMenuItem>
        {folders.length ? <DropdownMenuSeparator /> : null}
        {folders.map((folder) => (
          <DropdownMenuItem key={folder.id} onSelect={() => onChange(folder.id)}>
            <NotebookSwatch color={folder.color} />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {folder.id === folderId ? <Check className="size-3.5 text-ruth" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Now, or Tonight (opens the schedule-a-task flow with the draft as the prompt). */
export function WhenMenu({
  onTonight,
  open,
  onOpenChange,
}: {
  readonly onTonight: () => void;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  return (
    <DropdownMenu modal={false} {...(open === undefined ? {} : { open, onOpenChange })}>
      <DropdownMenuTrigger className={control} aria-label="When">
        <Clock className="size-3.5" />
        <span>Now</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuItem className="h-auto items-start gap-2.5 py-2">
          <Clock className="mt-0.5 size-3.5" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span>Now</span>
            <span className="text-xs text-muted-foreground">Ruth answers here</span>
          </span>
          <Check className="mt-0.5 size-3.5 text-ruth" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTonight} className="h-auto items-start gap-2.5 py-2">
          <Moon className="mt-0.5 size-3.5" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span>Tonight</span>
            <span className="text-xs text-muted-foreground">Ruth Cloud works on it overnight</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Round periwinkle send; a stop square while Ruth is working. */
export function SendButton({
  busy,
  disabled,
  onStop,
  size = 32,
}: {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onStop: () => void;
  readonly size?: 32 | 34;
}) {
  const box = size === 34 ? "size-[34px]" : "size-8";
  if (busy)
    return (
      <button
        type="button"
        aria-label="Stop"
        onClick={onStop}
        className={cn(
          box,
          "inline-flex shrink-0 items-center justify-center rounded-full bg-ruth text-ruth-foreground transition-opacity hover:opacity-90",
        )}
      >
        <Square className="size-3 fill-current" />
      </button>
    );
  return (
    <button
      type="submit"
      aria-label="Send"
      disabled={disabled}
      className={cn(
        box,
        "inline-flex shrink-0 items-center justify-center rounded-full bg-ruth text-ruth-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
      )}
    >
      <ArrowUp className="size-4" strokeWidth={2.2} />
    </button>
  );
}
