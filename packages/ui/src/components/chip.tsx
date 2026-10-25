import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

/** Pill shared by Chip and Badge: h26, hairline control border, 12px secondary text. */
const chipBase =
  "inline-flex h-[26px] w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-xs font-normal whitespace-nowrap transition-[color,background-color,border-color,scale] ease-out [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0";

const chipTones = {
  plain: "border-input text-foreground-soft",
  active: "border-input bg-accent text-foreground",
  ruth: "border-ruth-line bg-ruth-tint text-ruth-text",
  danger: "border-destructive-line text-destructive",
} as const;

/** Hover only for interactive chips (links and buttons). */
const chipInteractive =
  "[a&]:hover:text-foreground [button&]:hover:text-foreground [button&]:cursor-pointer [button&]:active:scale-[0.97]";

const chipVariants = cva(`${chipBase} ${chipInteractive} ${focusRing}`, {
  variants: {
    variant: {
      default: chipTones.plain,
      active: chipTones.active,
      ruth: chipTones.ruth,
    },
  },
  defaultVariants: { variant: "default" },
});

type ChipProps = React.ComponentProps<"span"> &
  VariantProps<typeof chipVariants> & {
    /** Shorthand for `variant="active"`. */
    active?: boolean;
    /** Render the child element (a button or link) instead of a span. */
    asChild?: boolean;
  };

function Chip({ className, variant, active, asChild = false, ...props }: ChipProps) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="chip"
      data-active={active ? "" : undefined}
      className={cn(chipVariants({ variant: active ? "active" : variant }), className)}
      {...props}
    />
  );
}

export { Chip, chipVariants, chipBase, chipTones, chipInteractive };
