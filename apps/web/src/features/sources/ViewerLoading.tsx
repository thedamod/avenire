import { cn } from "@avenire/ui/lib/utils";

/**
 * The silent placeholder for every loading stage of a framed viewer (metadata, signed URL,
 * lazy chunk, PDF.js): fills its parent like the finished viewer does, so nothing collapses or
 * jumps when the document arrives. A page outline at fit-width, clipped to the frame; no text.
 */
export function ViewerLoading({
  className,
  label = "Loading document",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex h-full min-h-0 w-full flex-1 justify-center overflow-hidden bg-surface-3 p-4",
        className,
      )}
    >
      <div className="aspect-[1/1.294] h-max w-full max-w-[760px] shrink-0 animate-pulse bg-surface-4 shadow-[0_1px_3px_rgb(0_0_0/0.3)] motion-reduce:animate-none" />
    </div>
  );
}
