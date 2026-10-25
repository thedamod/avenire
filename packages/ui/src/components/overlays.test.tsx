// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "./alert-dialog.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import { Sheet, SheetContent, SheetTitle } from "./sheet.tsx";

afterEach(cleanup);

describe("overlays", () => {
  it("renders dialog and alert dialog on the sheet surface", () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Pick a name</DialogDescription>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Delete?</AlertDialogTitle>
            <AlertDialogDescription>Cannot undo</AlertDialogDescription>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );
    const dialog = document.querySelector("[data-slot=dialog-content]");
    expect(dialog?.className).toContain("bg-sheet");
    expect(dialog?.className).toContain("sm:max-w-[440px]");
    expect(document.querySelector("[data-slot=dialog-close]")?.className).toContain("size-7");
    expect(document.querySelector("[data-slot=alert-dialog-content]")?.className).toContain(
      "bg-sheet",
    );
    expect(screen.getByText("Delete").className).toContain("bg-primary");
    expect(screen.getByText("Cancel").className).toContain("bg-secondary");
  });

  it("renders the bottom sheet with a grabber and rounded top", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>Capture</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector("[data-slot=sheet-content]")?.className).toContain(
      "rounded-t-[24px]",
    );
    expect(document.querySelector("[data-slot=sheet-grabber]")?.className).toContain("w-9");
    expect(document.querySelector("[data-slot=sheet-close]")).toBeNull();
  });

  it("renders popover and context menu content on the floating surface", () => {
    render(
      <>
        <Popover open>
          <PopoverTrigger>open</PopoverTrigger>
          <PopoverContent>hello</PopoverContent>
        </Popover>
        <ContextMenu>
          <ContextMenuTrigger>target</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Copy</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <DropdownMenu open>
          <DropdownMenuTrigger>menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>,
    );
    expect(document.querySelector("[data-slot=popover-content]")?.className).toContain(
      "bg-popover",
    );
    expect(screen.getByText("target")).toBeTruthy();
    expect(document.querySelector("[data-slot=dropdown-menu-content]")?.className).toContain(
      "bg-popover",
    );
    expect(document.querySelector("[data-slot=dropdown-menu-item]")?.className).toContain(
      "h-7",
    );
  });

  it("renders flat accordion and collapsible rows", () => {
    render(
      <>
        <Accordion type="single" collapsible defaultValue="a">
          <AccordionItem value="a" data-testid="item">
            <AccordionTrigger>Question</AccordionTrigger>
            <AccordionContent>Answer</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Collapsible defaultOpen>
          <CollapsibleTrigger>More</CollapsibleTrigger>
          <CollapsibleContent>Hidden</CollapsibleContent>
        </Collapsible>
      </>,
    );
    expect(screen.getByTestId("item").className).toContain("border-b");
    expect(screen.getByText("Answer")).toBeTruthy();
    expect(screen.getByText("Hidden")).toBeTruthy();
  });
});
