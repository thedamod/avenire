import type { FolderColor } from "@avenire/contracts";
import { cn } from "@avenire/ui/lib/utils";
import { notebookColor } from "./notebook-style";

/** The small colour square used in chips, breadcrumbs and pickers. */
export function NotebookSwatch({
  color,
  className,
}: {
  color: FolderColor | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2.5 w-[7px] shrink-0 rounded-[1.5px]", className)}
      style={{ background: notebookColor(color) }}
    />
  );
}

/** Swatch + notebook name, the muted chip shown next to row titles. */
export function NotebookTag({
  name,
  color,
  className,
}: {
  name: string;
  color: FolderColor | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-[12.5px] leading-4 text-foreground-soft",
        className,
      )}
    >
      <NotebookSwatch color={color} />
      <span className="truncate">{name}</span>
    </span>
  );
}
