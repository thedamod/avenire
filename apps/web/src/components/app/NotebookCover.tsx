import type { Folder } from "@avenire/contracts";
import { cn } from "@avenire/ui/lib/utils";
import { CoverGlyph } from "./cover-glyphs";
import { notebookColor } from "./notebook-style";

type CoverFolder = Pick<Folder, "name" | "color" | "cover"> &
  Partial<Pick<Folder, "noteCount" | "sourceCount">>;

/**
 * The coloured book cover: diagonal hatch, darker spine, title, line-art glyph and counts.
 * Everything is sized in `em`: `scale` (1 = 132×172) or a font-size class resizes the cover.
 */
export function NotebookCover({
  folder,
  scale,
  showCounts = true,
  className,
}: {
  folder: CoverFolder;
  scale?: number;
  showCounts?: boolean;
  className?: string;
}) {
  const counts = coverCounts(folder);
  return (
    <div
      className={cn(
        "relative h-[17.2em] w-[13.2em] shrink-0 overflow-hidden text-[10px] select-none",
        className,
      )}
      style={{
        ...(scale === undefined ? {} : { fontSize: `${10 * scale}px` }),
        borderRadius: "0.3em 0.8em 0.8em 0.3em",
        background: `repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 0.1em, rgba(255,255,255,0) 0.1em, rgba(255,255,255,0) 0.7em) ${notebookColor(folder.color)}`,
      }}
    >
      <div className="absolute inset-y-0 left-0 w-[0.8em] bg-black/20" />
      <div className="absolute top-[1.3em] right-[0.6em] left-[1.6em] line-clamp-3 text-[1.2em] leading-[1.3] font-semibold tracking-[-0.01em] break-words text-[#111]">
        {folder.name}
      </div>
      <div className="absolute right-[0.6em] bottom-[2em] size-[6.8em]">
        <CoverGlyph cover={folder.cover} size="100%" />
      </div>
      {showCounts && counts ? (
        <div className="absolute bottom-[1em] left-[1.6em] font-mono text-[0.95em] leading-[1.25] tracking-[0.04em] whitespace-pre text-black/60">
          {counts}
        </div>
      ) : null}
    </div>
  );
}

function coverCounts(folder: CoverFolder): string | null {
  if (folder.noteCount === undefined && folder.sourceCount === undefined) return null;
  const notes = folder.noteCount ?? 0;
  const sources = folder.sourceCount ?? 0;
  if (notes + sources === 0) return "Empty";
  return [notes ? plural(notes, "note") : null, sources ? plural(sources, "source") : null]
    .filter(Boolean)
    .join("\n");
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
