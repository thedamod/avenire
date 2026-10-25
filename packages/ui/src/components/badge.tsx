import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.ts";
import { chipBase, chipInteractive, chipTones } from "./chip.tsx";
import { focusRing } from "./shared.ts";

/** Badge keeps the shadcn variant names on top of the Chip look. */
const badgeVariants = cva(`${chipBase} ${chipInteractive} ${focusRing}`, {
  variants: {
    variant: {
      default: chipTones.active,
      secondary: chipTones.plain,
      destructive: chipTones.danger,
      outline: chipTones.plain,
      ruth: chipTones.ruth,
    },
  },
  defaultVariants: { variant: "default" },
});
function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
export { Badge, badgeVariants };
