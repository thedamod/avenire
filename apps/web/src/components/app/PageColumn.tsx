import type { ComponentProps } from "react";
import { cn } from "@avenire/ui/lib/utils";

/**
 * The centred content column: 880px on desktop (home, notebook, trash, settings), full width
 * with 16px gutters on phone. `width` overrides the desktop width (e.g. 736 for task detail).
 */
export function PageColumn({
  width = 880,
  className,
  style,
  ...props
}: ComponentProps<"div"> & { width?: number }) {
  return (
    <div
      className={cn("mx-auto w-full px-4 md:box-content md:px-8", className)}
      style={{ maxWidth: width, ...style }}
      {...props}
    />
  );
}
