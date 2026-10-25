"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import type { AvenireWindowBridge } from "@avenire/desktop/bridge";
import { setTitlebarSlots } from "./titlebar";
import "./desktop-frame.css";

/**
 * Native caption buttons retain Windows snap layouts and macOS traffic lights. The frame renders
 * the same markup everywhere; `<html data-desktop-chrome>` (set before first paint, see chrome.ts)
 * turns it into a title bar row above the page. Page headers portal their breadcrumbs and ⋯ menu
 * into its two slots (see titlebar.tsx); pages without one leave a plain drag region.
 */
export function DesktopFrame({
  children,
  bridge,
}: {
  children: ReactNode;
  bridge?: AvenireWindowBridge | undefined;
}) {
  const start = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if ((bridge ?? window.avenire) && navigator.windowControlsOverlay?.visible)
      root.dataset.desktopChrome ??= window.avenire?.platform ?? "";
    const syncSlots = () =>
      setTitlebarSlots(
        root.dataset.desktopChrome !== undefined && start.current && end.current
          ? { start: start.current, end: end.current }
          : null,
      );
    syncSlots();
    const observer = new MutationObserver(syncSlots);
    observer.observe(root, { attributes: true, attributeFilter: ["data-desktop-chrome"] });
    return () => {
      observer.disconnect();
      setTitlebarSlots(null);
    };
  }, [bridge]);
  useEffect(() => {
    const native = bridge ?? window.avenire;
    if (!native?.getWindowChrome) return;
    const root = document.documentElement;
    let active = true;
    // The main process is authoritative; if it can't answer, the overlay check above stands.
    void native
      .getWindowChrome()
      .then((chrome) => {
        if (!active) return;
        if (chrome) root.dataset.desktopChrome = chrome.platform;
        else delete root.dataset.desktopChrome;
      })
      .catch(() => {});
    const updateTheme = () => {
      void native
        .setWindowTheme(root.classList.contains("light") ? "light" : "dark")
        .catch(() => {});
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [bridge]);

  return (
    <div className="desktop-frame">
      <header className="desktop-titlebar" aria-label="Title bar">
        <div ref={start} className="desktop-titlebar-start" />
        <div ref={end} className="desktop-titlebar-end" />
      </header>
      <div className="desktop-frame-content">{children}</div>
    </div>
  );
}
