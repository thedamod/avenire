import * as React from "react";
import { cn } from "../lib/utils.ts";
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground selection:bg-ruth/30 bg-surface-3 text-foreground caret-ruth flex field-sizing-content min-h-16 w-full rounded-lg border px-3 py-2.5 text-[13.5px] transition-colors outline-none focus-visible:border-ring aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
export { Textarea };
