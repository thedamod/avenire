import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  floatingSurface,
  menuIndicator,
  menuItem,
  menuItemDestructive,
  menuItemIndicated,
  menuLabel,
  menuSeparator,
  menuShortcut,
} from "./shared.ts";
import { MenuViewport } from "./menu-viewport.tsx";
const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;
function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(menuItem, "data-[state=open]:bg-accent", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  );
}
function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(floatingSurface, "overflow-hidden", className)}
      {...props}
    />
  );
}
function ContextMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          floatingSurface,
          "flex max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin) flex-col overflow-hidden p-0",
          className,
        )}
        {...props}
      >
        <MenuViewport>{children}</MenuViewport>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}
function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menuItem, menuItemDestructive, className)}
      {...props}
    />
  );
}
function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      {...(checked === undefined ? {} : { checked })}
      className={cn(menuItemIndicated, className)}
      {...props}
    >
      <span className={menuIndicator}>
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="size-3.5 text-foreground" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}
function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(menuItemIndicated, className)}
      {...props}
    >
      <span className={menuIndicator}>
        <ContextMenuPrimitive.ItemIndicator>
          <Circle className="size-1.5 fill-current text-foreground" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}
function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(menuLabel, className)}
      {...props}
    />
  );
}
function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn(menuSeparator, className)}
      {...props}
    />
  );
}
function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="context-menu-shortcut" className={cn(menuShortcut, className)} {...props} />
  );
}
export {
  ContextMenu,
  ContextMenuPortal,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
};
