import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

/** Segmented control: a padded container with equal-width items. */
function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "border-border bg-surface-3 flex w-full items-center gap-0.5 rounded-[9px] border p-0.5",
        className,
      )}
      {...props}
    />
  );
}
function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-foreground-soft hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground inline-flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[12.5px] whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 data-[state=on]:font-semibold [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}
export { ToggleGroup, ToggleGroupItem };
