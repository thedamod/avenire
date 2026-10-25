"use client";

import { useState } from "react";
import type { Folder, FolderColor, FolderCover } from "@avenire/contracts";
import { Button } from "@avenire/ui/components/button";
import { cn } from "@avenire/ui/lib/utils";
import {
  CoverGlyph,
  NOTEBOOK_COLOR_ORDER,
  NotebookCover,
  ResponsiveDialog,
  notebookColor,
} from "~/components/app";
import { useIsMobile } from "~/lib/responsive";

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

/** Change a notebook's colour and cover drawing (same pickers and preview as 18a / M11). */
export function CoverDialog({
  folder,
  open,
  onOpenChange,
  onSave,
}: {
  folder: Folder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { color: FolderColor; cover: FolderCover }) => void;
}) {
  const isMobile = useIsMobile();
  const [color, setColor] = useState<FolderColor>(folder.color);
  const [cover, setCover] = useState<FolderCover>(folder.cover);

  // Start from the notebook's current cover each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setColor(folder.color);
      setCover(folder.cover);
    }
  }

  const preview = (
    <NotebookCover folder={{ ...folder, color, cover }} scale={isMobile ? 1 : 1.28} />
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change cover"
      hideTitle={!isMobile}
      className="max-w-[760px] sm:max-w-[760px]"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onOpenChange(false);
          if (color !== folder.color || cover !== folder.cover) onSave({ color, cover });
        }}
        className="flex min-h-0 flex-1 flex-col md:flex-row"
      >
        <div className="flex justify-center pt-2 pb-5 md:hidden">{preview}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 px-5 md:px-6 md:pt-6 md:pb-5">
          <p aria-hidden="true" className="hidden text-[17px] leading-snug font-semibold md:block">
            Change cover
          </p>
          <fieldset>
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
            <div className="flex flex-wrap gap-2">
              {COVERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={option}
                  aria-pressed={cover === option}
                  onClick={() => setCover(option)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-lg border text-xs text-foreground-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:size-[52px]",
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
          <div className="mt-auto flex flex-col items-stretch gap-3 pt-6 pb-[max(16px,env(safe-area-inset-bottom))] md:flex-row md:items-center md:justify-end md:pb-0">
            <Button
              type="button"
              variant="ghost"
              className="hidden md:inline-flex"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-11 md:h-8">
              Save cover
            </Button>
          </div>
        </div>
        <div className="hidden min-h-[380px] w-[262px] shrink-0 items-center justify-center rounded-r-xl border-l border-border bg-[#131313] md:flex">
          {preview}
        </div>
      </form>
    </ResponsiveDialog>
  );
}
