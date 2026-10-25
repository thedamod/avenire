import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";

/** Flat aside: 2px left rule, no background, no radius. Tone lives in the rule and icon only. */
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-x-0 gap-y-1 border-l-2 pl-3 has-[>svg]:grid-cols-[15px_1fr] has-[>svg]:gap-x-2 [&>svg]:size-[15px] [&>svg]:translate-y-px",
  {
    variants: {
      variant: {
        default: "border-l-input [&>svg]:text-foreground-soft",
        ruth: "border-l-ruth [&>svg]:text-ruth",
        destructive: "border-l-destructive [&>svg]:text-destructive",
        success: "border-l-success [&>svg]:text-success",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("text-foreground col-start-2 text-sm leading-5 font-semibold", className)}
      {...props}
    />
  );
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-foreground-soft col-start-2 text-[13.5px] leading-5", className)}
      {...props}
    />
  );
}
export { Alert, AlertTitle, AlertDescription, alertVariants };
