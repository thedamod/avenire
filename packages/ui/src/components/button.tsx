import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

const buttonVariants = cva(
  `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium motion-press select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 ${focusRing}`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 dark:hover:bg-white",
        secondary: "border border-input bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-input bg-transparent text-foreground hover:bg-hover",
        ghost: "text-foreground-soft hover:bg-hover hover:text-foreground",
        ruth: "bg-ruth text-ruth-foreground hover:bg-ruth/90",
        destructive:
          "border border-destructive-line bg-destructive-tint text-destructive hover:bg-destructive-line/40",
        link: "text-foreground-soft underline-offset-4 hover:text-foreground hover:underline",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 rounded-[7px] px-2.5 text-xs",
        lg: "h-9 px-3.5 text-sm",
        xl: "h-11 rounded-xl px-4 text-[15px]",
        icon: "size-8 px-0",
        "icon-sm": "size-7 rounded-[7px] px-0",
      },
      /** `pill` overrides the size's corner radius; used for marketing calls to action. */
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default", shape: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  shape,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
