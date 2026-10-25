import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { buttonVariants } from "./button.tsx";
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/[.55] ease-drawer data-[state=open]:animate-in data-[state=open]:duration-drawer data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:duration-drawer-exit data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  /** Defaults to true, except for the `bottom` mobile sheet, which has a grabber instead. */
  showCloseButton?: boolean;
}) {
  const closeButton = showCloseButton ?? side !== "bottom";
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          // Slides from its edge by its own size on the iOS drawer curve: 400ms in, 250ms out.
          // Reduced motion drops the slide (globals.css) and keeps a fade.
          "bg-sheet border-sheet-border fixed z-50 flex flex-col gap-4 ease-drawer data-[state=open]:animate-in data-[state=open]:duration-drawer data-[state=closed]:animate-out data-[state=closed]:duration-drawer-exit motion-reduce:data-[state=open]:fade-in-0 motion-reduce:data-[state=closed]:fade-out-0",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[92dvh] gap-3 rounded-t-[24px] border-t pb-[env(safe-area-inset-bottom)] [&_[data-slot=sheet-title]]:text-lg data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        {side === "bottom" && (
          <div
            data-slot="sheet-grabber"
            aria-hidden="true"
            className="bg-control-strong mx-auto mt-[7px] h-[5px] w-9 shrink-0 rounded-[3px]"
          />
        )}
        {children}
        {closeButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "absolute top-3 right-3",
            )}
          >
            <X />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground text-base leading-snug font-semibold", className)}
      {...props}
    />
  );
}
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-foreground-soft text-[13.5px] leading-5", className)}
      {...props}
    />
  );
}
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
