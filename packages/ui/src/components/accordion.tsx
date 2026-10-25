import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { focusRing } from "./shared.ts";
/** Flat rows separated by hairlines; no boxed container. */
function Accordion(props: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}
function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-border border-b last:border-b-0", className)}
      {...props}
    />
  );
}
function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "text-foreground flex flex-1 items-center justify-between gap-4 rounded-sm py-3 text-left text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&[data-state=open]>svg]:rotate-180",
          focusRing,
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="text-muted-foreground pointer-events-none size-3.5 shrink-0 transition-[rotate] duration-moderate ease-out" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}
function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-[13.5px] duration-moderate ease-out motion-reduce:animate-none"
      {...props}
    >
      <div className={cn("text-foreground-soft pb-3 leading-5", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
