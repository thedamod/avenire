"use client";

import { useState } from "react";
import type { Folder, FolderColor, FolderCover } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import { Input } from "@avenire/ui/components/input";
import { cn } from "@avenire/ui/lib/utils";
import { toast } from "sonner";
import {
  CoverGlyph,
  NOTEBOOK_COLOR_ORDER,
  NotebookCover,
  ResponsiveDialog,
  notebookColor,
} from "~/components/app";
import { useIsMobile } from "~/lib/responsive";
import { errorMessage } from "~/lib/rpc";
import { useLibrary } from "./LibraryProvider";

const COVERS: readonly FolderCover[] = [
  "cradle",
  "flask",
  "globe",
  "compass",
  "book",
  "atom",
  "chart",
  "leaf",
  "none",
];

/** 18a / M11. Name, colour and cover drawing, with a live cover preview. */
export function NewNotebookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folder: Folder) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New notebook"
      hideTitle={!isMobile}
      full
      className="max-w-[800px] sm:max-w-[800px]"
    >
      <NewNotebookForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
    </ResponsiveDialog>
  );
}

/** Mounted only while the dialog is open, so every open starts fresh. */
function NewNotebookForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: ((folder: Folder) => void) | undefined;
}) {
  const { actions } = useLibrary();
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [color, setColor] = useState<FolderColor>(
    () => NOTEBOOK_COLOR_ORDER[Math.floor(Math.random() * NOTEBOOK_COLOR_ORDER.length)]!,
  );
  const [cover, setCover] = useState<FolderCover>("cradle");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const folder = await actions.createNotebook({ name: trimmed, color, cover });
      onClose();
      onCreated?.(folder);
    } catch (cause) {
      toast.error(`Couldn't create the notebook: ${errorMessage(cause)}`);
      setBusy(false);
    }
  }

  const preview = (
    <NotebookCover
      folder={{
        name: name.trim() || "Untitled notebook",
        color,
        cover,
        noteCount: 0,
        sourceCount: 0,
      }}
      scale={isMobile ? 1 : 1.28}
    />
  );

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="flex justify-center pt-2 pb-5 md:hidden">{preview}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-5 md:px-6 md:pt-6 md:pb-5">
        <p aria-hidden="true" className="hidden text-[17px] leading-snug font-semibold md:block">
          New notebook
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-medium">Name</span>
          <Input
            autoFocus={!isMobile}
            value={name}
            maxLength={120}
            placeholder="e.g. Statistical Mechanics"
            onChange={(event) => setName(event.target.value)}
            className="h-11 md:h-9"
          />
        </label>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-[13px] font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {NOTEBOOK_COLOR_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={option}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                className={cn(
                  "size-7 rounded-full transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-[26px]",
                  color === option && "shadow-[0_0_0_2px_#131313,0_0_0_3.5px_#EDEDED]",
                )}
                style={{ background: notebookColor(option) }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2.5 text-[13px] font-medium">Cover drawing</legend>
          <div className="flex flex-wrap gap-2 md:gap-1.5">
            {COVERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={option}
                aria-pressed={cover === option}
                onClick={() => setCover(option)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-lg border text-xs text-foreground-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-[46px]",
                  option === "none" && "border-dashed",
                  cover === option
                    ? "border-foreground bg-surface-5 text-foreground"
                    : "border-input hover:bg-hover",
                )}
              >
                {option === "none" ? (
                  "None"
                ) : (
                  <CoverGlyph
                    cover={option}
                    size={32}
                    viewBox="10 10 100 100"
                    strokeWidth={2.2}
                    stroke={cover === option ? "#EDEDED" : "#A3A3A3"}
                  />
                )}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-auto flex flex-col items-stretch gap-3 pt-6 pb-[max(16px,env(safe-area-inset-bottom))] md:flex-row md:items-center md:pb-0">
          <p className="text-center text-xs text-muted-foreground md:mr-auto md:text-left">
            Ruth can file new captures here automatically
          </p>
          <Button type="button" variant="ghost" className="hidden md:inline-flex" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || busy} className="h-11 md:h-8">
            Create notebook
          </Button>
        </div>
      </div>
      <div className="hidden min-h-[420px] w-[262px] shrink-0 items-center justify-center rounded-r-xl border-l border-border bg-[#131313] md:flex">
        {preview}
      </div>
    </form>
  );
}
