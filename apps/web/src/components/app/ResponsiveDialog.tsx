"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@avenire/ui/components/dialog";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@avenire/ui/components/sheet";
import { cn } from "@avenire/ui/lib/utils";
import { useIsMobile } from "~/lib/responsive";

/**
 * A centred dialog on desktop that becomes a bottom sheet on phone (README: desktop dialogs
 * become `Sheet side="bottom"`). `full` makes the phone sheet full height.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  full = false,
  className,
  sheetClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  hideTitle?: boolean;
  full?: boolean;
  className?: string;
  sheetClassName?: string;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  if (isMobile)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn("gap-0 bg-[#131313]", full && "h-[calc(100dvh-52px)]", sheetClassName)}
        >
          <SheetTitle className={cn("px-5 pt-3 pb-1 text-lg", hideTitle && "sr-only")}>
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="px-5 pb-2">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
          <ScrollFade className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </ScrollFade>
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-0 p-0", className)}>
        <DialogTitle className={cn("px-6 pt-6 text-[17px]", hideTitle && "sr-only")}>
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="px-6 pt-1">{description}</DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
