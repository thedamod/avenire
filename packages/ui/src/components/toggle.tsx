import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

const toggleVariants = cva(
  `text-foreground-soft hover:bg-hover hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap motion-press disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 ${focusRing}`,
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-input border bg-transparent",
      },
      size: {
        default: "h-8 min-w-8 px-2",
        sm: "h-7 min-w-7 rounded-[7px] px-1.5 text-xs",
        lg: "h-9 min-w-9 px-2.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}
export { Toggle, toggleVariants };
