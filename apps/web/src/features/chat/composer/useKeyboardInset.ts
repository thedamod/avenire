"use client";

import { useEffect, useState } from "react";

/**
 * Height of the on-screen keyboard (or anything else shrinking the visual viewport), so a
 * bottom-docked composer can sit just above it. 0 on desktop.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered = window.innerHeight - (viewport.height + viewport.offsetTop);
        setInset(covered > 40 ? Math.round(covered) : 0);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
