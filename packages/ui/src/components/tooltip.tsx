import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../lib/utils.ts";
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
/**
 * Flat label, no arrow. Only the first tooltip (after the provider's delay) animates: 125ms
 * scale 0.97 + fade from the trigger. Tooltips opened within the skip window (`instant-open`,
 * e.g. sweeping along a dock) and every close are instant, so two never cross-fade.
 */
function TooltipContent({
  className,
  sideOffset = 4,
  container,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  sideOffset?: number;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null | undefined;
}) {
  return (
    <TooltipPrimitive.Portal {...(container ? { container } : {})}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-secondary text-foreground border-input ease-out data-[state=delayed-open]:animate-in data-[state=delayed-open]:duration-tooltip data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-97 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md border px-2 py-[5px] text-xs text-balance",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
