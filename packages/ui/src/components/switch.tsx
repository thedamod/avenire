import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer bg-switch-off data-[state=checked]:bg-foreground inline-flex h-[18px] w-8 shrink-0 items-center rounded-[9px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 translate-x-[2px] rounded-full bg-white transition-[translate,background-color] duration-normal ease-out data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-background"
      />
    </SwitchPrimitive.Root>
  );
}
export { Switch };
