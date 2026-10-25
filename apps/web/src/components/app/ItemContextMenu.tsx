"use client";

import Link from "next/link";
import { Fragment, useRef, type ReactElement } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@avenire/ui/components/context-menu";
import { MenuViewport } from "@avenire/ui/components/menu-viewport";
import type { HeaderAction } from "./PageHeader";

/**
 * HeaderAction fields (label, icon, onSelect, href, destructive, disabled; pinned is ignored)
 * plus the fields below. Hidden actions are removed before grouping. A separator appears
 * whenever adjacent visible group values differ. children renders a recursive submenu;
 * its parent onSelect/href is ignored. shortcut is display-only, never a key binding.
 */
export interface ContextAction extends HeaderAction {
  readonly shortcut?: string;
  readonly group?: string;
  readonly children?: readonly ContextAction[];
  readonly hidden?: boolean;
}

/**
 * No DOM wrapper: child must forward DOM props/ref (asChild). Its existing focusability is
 * preserved. data-state="open" is applied to the child; style it there for custom active states.
 * Touch pointerdown still reaches the child's long-press handler, but never starts Radix's timer.
 */
export function ItemContextMenu({
  actions,
  disabled = false,
  children,
}: {
  actions: readonly ContextAction[];
  disabled?: boolean;
  children: ReactElement;
}) {
  const pointerType = useRef("");
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        disabled={disabled || !actions.some((action) => !action.hidden)}
        className="data-[state=open]:bg-hover"
        onPointerDownCapture={(event) => {
          pointerType.current = event.pointerType;
        }}
        onPointerDown={(event) => {
          // Radix composes this AFTER the child's handler and BEFORE its own touch timer.
          if (event.pointerType === "touch") event.preventDefault();
        }}
        onContextMenu={(event) => {
          if (pointerType.current === "touch") event.preventDefault();
          else returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onKeyDown={(event) => {
          if (disabled || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")))
            return;
          event.preventDefault();
          pointerType.current = "";
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: bounds.left + 12,
              clientY: bounds.bottom,
            }),
          );
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-56"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!document.activeElement?.closest('[role="dialog"]')) returnFocus.current?.focus();
        }}
      >
        <ActionItems actions={actions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ActionItems({ actions }: { actions: readonly ContextAction[] }) {
  const visible = actions.filter((action) => !action.hidden);
  return visible.map((action, index) => {
    const Icon = action.icon;
    const content = (
      <>
        {Icon ? <Icon className="size-3.5" /> : null}
        <span>{action.label}</span>
        {action.shortcut ? <ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut> : null}
      </>
    );
    return (
      <Fragment key={`${action.group ?? ""}-${action.label}`}>
        {index > 0 && action.group !== visible[index - 1]?.group ? <ContextMenuSeparator /> : null}
        {action.children ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!!action.disabled}>{content}</ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent className="flex max-h-[min(20rem,var(--radix-context-menu-content-available-height))] min-w-48 flex-col p-0 origin-(--radix-context-menu-content-transform-origin)">
                <MenuViewport>
                  <ActionItems actions={action.children} />
                </MenuViewport>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
        ) : (
          <ContextMenuItem
            disabled={!!action.disabled}
            variant={action.destructive ? "destructive" : "default"}
            onSelect={() => action.onSelect?.()}
            asChild={!!action.href}
          >
            {action.href ? (
              <Link
                href={action.href}
                aria-disabled={action.disabled || undefined}
                onClick={(event) => {
                  if (action.disabled) event.preventDefault();
                }}
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </ContextMenuItem>
        )}
      </Fragment>
    );
  });
}
