"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type Focuser = () => void;
let homeComposer: Focuser | undefined;

/** The home composer registers itself so ⌘K and `/` can focus it. */
export function registerHomeComposer(focus: Focuser): () => void {
  homeComposer = focus;
  return () => {
    if (homeComposer === focus) homeComposer = undefined;
  };
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/** Global shortcuts: ⌘K / Ctrl K anywhere, or `/` outside a text field, focus the home composer. */
export function KeyboardLayer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    function onKeyDown(event: KeyboardEvent) {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target);
      if (!commandK && !slash) return;
      if (!homeComposer) return;
      event.preventDefault();
      homeComposer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

  return null;
}
