import * as React from "react";
import { cn } from "../lib/utils.ts";
import { useScrollFade } from "./scroll-fade.tsx";

/**
 * The scrolling inside of a menu. The surface keeps its border and shadow; the fade mask lives
 * here (a mask on the surface would clip its shadow). Padding matches `floatingSurface`'s p-1.
 */
export function MenuViewport({ className, ...props }: React.ComponentProps<"div">) {
  const fade = useScrollFade<HTMLDivElement>("y");
  return (
    <div
      ref={fade}
      data-slot="menu-viewport"
      className={cn("edge-fade-y min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1", className)}
      {...props}
    />
  );
}
