/** Class strings shared across components so menus, popovers and focus rings stay identical. */

/** 2px periwinkle ring at 50% with a 1px page-coloured offset. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Enter/exit for anything anchored to a trigger: scale 0.96 + fade from the Radix
 * `--radix-*-content-transform-origin` (each component sets `origin-*`), 150ms in, 100ms out.
 */
export const floatingMotion =
  "ease-out data-[state=open]:animate-in data-[state=open]:duration-popover data-[state=open]:fade-in-0 data-[state=open]:zoom-in-96 data-[state=closed]:animate-out data-[state=closed]:duration-fast data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-96";

/** Surface for every floating panel: popover, dropdown, context menu, select. */
export const floatingSurface = `bg-popover text-popover-foreground border border-input rounded-lg p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)] z-50 min-w-[8rem] ${floatingMotion}`;

/** Centred modal: scale 0.96 from the centre (modals aren't anchored), 200ms in, 150ms out. */
export const modalMotion =
  "ease-out data-[state=open]:animate-in data-[state=open]:duration-moderate data-[state=open]:fade-in-0 data-[state=open]:zoom-in-96 data-[state=closed]:animate-out data-[state=closed]:duration-popover data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-96";

/** Backdrop behind dialogs and sheets, timed with the surface it sits under. */
export const overlayMotion =
  "ease-out data-[state=open]:animate-in data-[state=open]:duration-moderate data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:duration-popover data-[state=closed]:fade-out-0";

export const menuItem =
  "relative flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-foreground outline-hidden select-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-foreground-soft";

export const menuItemDestructive =
  "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive-tint data-[variant=destructive]:[&_svg:not([class*='text-'])]:text-destructive";

/** Checkbox / radio rows keep the indicator in a left gutter. */
export const menuItemIndicated = `${menuItem} pl-8`;

export const menuLabel =
  "px-2 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground data-[inset]:pl-8";

export const menuSeparator = "bg-border -mx-1 my-1 h-px";

export const menuShortcut = "ml-auto pl-4 font-mono text-[11px] text-muted-foreground";

export const menuIndicator = "absolute left-2 flex size-3.5 items-center justify-center";
