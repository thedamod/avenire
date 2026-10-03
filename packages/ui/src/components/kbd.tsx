import * as React from "react"
import { cn } from "../lib/utils.ts"
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) { return <kbd data-slot="kbd" className={cn("bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium select-none [&_svg:not([class*='size-'])]:size-3", className)} {...props} /> }
function KbdGroup({ className, ...props }: React.ComponentProps<"span">) { return <span data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} /> }
export { Kbd, KbdGroup }
