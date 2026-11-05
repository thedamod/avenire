import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";

/**
 * A field with controls inside it (a search with a shortcut, an email with its submit button).
 * The group draws the border and focus state; the input inside is bare.
 */
const inputGroupVariants = cva(
  "border-input bg-surface-3 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[aria-invalid=true]]:border-destructive flex w-full min-w-0 items-center border transition-colors has-[:disabled]:opacity-40",
  {
    variants: {
      size: {
        default: "h-9 gap-1.5 rounded-lg px-3",
        lg: "h-14 gap-2 rounded-xl py-1.5 pr-1.5 pl-5 [&>[data-slot=input-group-control]]:text-[15px]",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    defaultVariants: { size: "default", shape: "default" },
  },
);

function InputGroup({
  className,
  size,
  shape,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupVariants>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(inputGroupVariants({ size, shape }), className)}
      {...props}
    />
  );
}

function InputGroupInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-ruth/30 text-foreground caret-ruth h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** Icons, shortcuts or buttons sitting inside the field, before or after the input. */
function InputGroupAddon({
  className,
  align = "end",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(
        "text-muted-foreground flex shrink-0 items-center gap-1.5 data-[align=start]:order-first [&>svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon, InputGroupInput, inputGroupVariants };
