import * as React from "react";
import { cn } from "../lib/utils.ts";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-ruth/30 border-input bg-surface-3 text-foreground caret-ruth h-9 w-full min-w-0 rounded-lg border px-3 text-[13.5px] transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[13px] file:font-medium focus-visible:border-ring aria-invalid:border-destructive disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
export { Input };
