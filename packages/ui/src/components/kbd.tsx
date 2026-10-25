import * as React from "react";
import { cn } from "../lib/utils.ts";
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-secondary text-foreground border-control-strong pointer-events-none inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md border border-b-2 px-1.5 font-mono text-[11.5px] font-medium select-none [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}
function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}
export { Kbd, KbdGroup };
