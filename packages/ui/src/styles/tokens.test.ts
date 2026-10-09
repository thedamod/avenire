import { readFile } from "node:fs/promises";
import { expect, it } from "@effect/vitest";
import { parseThemeTokens, widgetTokenSheet } from "../../scripts/generate-tokens.ts";
import { THEME_TOKENS, THEME_TOKEN_NAMES, WIDGET_TOKEN_SHEET } from "./tokens.ts";

it("keeps generated theme tokens and widget instructions in sync with CSS", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");
  const parsed = parseThemeTokens(css);
  expect(THEME_TOKENS).toEqual(parsed);
  expect(THEME_TOKEN_NAMES).toEqual(Object.keys(parsed.light));
  expect(WIDGET_TOKEN_SHEET).toBe(widgetTokenSheet(Object.keys(parsed.light)));
  expect(WIDGET_TOKEN_SHEET.split("\n").length).toBeLessThanOrEqual(60);
});
