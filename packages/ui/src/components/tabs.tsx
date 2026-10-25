import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";

type TabsVariant = "underline" | "pill";
const TabsVariantContext = React.createContext<TabsVariant>("underline");

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

/** `underline` (default, page tabs) or `pill` (compact switcher). */
function TabsList({
  className,
  variant = "underline",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          variant === "underline"
            ? "border-border flex w-full items-end gap-5 border-b"
            : "inline-flex w-fit items-center gap-1",
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "text-foreground-soft hover:text-foreground data-[state=active]:text-foreground inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 data-[state=active]:font-semibold [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        focusRing,
        variant === "underline"
          ? "-mb-px border-b-[1.5px] border-transparent pb-2.5 text-sm data-[state=active]:border-foreground"
          : "data-[state=active]:bg-accent h-8 rounded-lg px-[11px] text-[13px]",
        className,
      )}
      {...props}
    />
  );
}
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}
export { Tabs, TabsList, TabsTrigger, TabsContent };
