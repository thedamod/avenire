import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
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
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(menuItem, "data-[state=open]:bg-accent", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}
function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(floatingSurface, "overflow-hidden", className)}
      {...props}
    />
  );
}
function DropdownMenuContent({
  className,
  sideOffset = 4,
  container,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  sideOffset?: number;
  /** Portal target; defaults to document.body. Pass a fullscreen element to keep the menu visible. */
  container?: HTMLElement | null | undefined;
}) {
  return (
    <DropdownMenuPrimitive.Portal {...(container ? { container } : {})}>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          floatingSurface,
          "flex max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin) flex-col overflow-hidden p-0",
          className,
        )}
        {...props}
      >
        <MenuViewport>{children}</MenuViewport>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menuItem, menuItemDestructive, className)}
      {...props}
    />
  );
}
function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      {...(checked === undefined ? {} : { checked })}
      className={cn(menuItemIndicated, className)}
      {...props}
    >
      <span className={menuIndicator}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5 text-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(menuItemIndicated, className)}
      {...props}
    >
      <span className={menuIndicator}>
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-1.5 fill-current text-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(menuLabel, className)}
      {...props}
    />
  );
}
function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(menuSeparator, className)}
      {...props}
    />
  );
}
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="dropdown-menu-shortcut" className={cn(menuShortcut, className)} {...props} />
  );
}
export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
