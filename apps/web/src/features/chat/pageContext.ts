"use client";

import type { PageContext } from "@avenire/contracts";
import { THEME_TOKEN_NAMES } from "@avenire/ui/tokens";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function readThemeTokens(): Record<string, string> {
  const root = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    THEME_TOKEN_NAMES.map((name) => [name, root.getPropertyValue(name).trim()]),
  );
}

const PHONE = "(max-width: 767.98px)";

/** The page facts `get_page_context` hands to Ruth, measured from the chat column. */
export function measurePage(column: HTMLElement | null): PageContext {
  const root = getComputedStyle(document.documentElement);
  const phone = window.matchMedia(PHONE).matches;
  return {
    surface: "chat",
    platform: phone ? "mobile" : window.avenire ? "desktop" : "web",
    contentWidthPx: Math.max(1, Math.round(column?.clientWidth ?? (phone ? 350 : 736))),
    colorScheme: document.documentElement.classList.contains("light") ? "light" : "dark",
    themeTokens: readThemeTokens(),
    fonts: {
      body: getComputedStyle(document.body).fontFamily,
      mono: root.getPropertyValue("--font-mono").trim() || "monospace",
    },
  };
}

/** Theme tokens + scheme for widget frames, read after next-themes applies the class. */
export function useWidgetTheme(): {
  colorScheme: "light" | "dark";
  tokens: Record<string, string>;
} {
  const { resolvedTheme } = useTheme();
  const colorScheme = resolvedTheme === "light" ? "light" : "dark";
  const [tokens, setTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    const frame = requestAnimationFrame(() => setTokens(readThemeTokens()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return { colorScheme, tokens };
}
