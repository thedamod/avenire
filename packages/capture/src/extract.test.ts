// @vitest-environment happy-dom
import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { PageSnapshot } from "@avenire/contracts";
import { PAYWALL_SELECTORS } from "./access.ts";
import { extractPage } from "./extract.ts";

it("executes from serialized source, bounds text without splitting surrogate pairs and emits valid wire data", () => {
  document.documentElement.innerHTML =
    '<head><title> Study </title><link rel="canonical" href="/paper"><meta name="description" content="Abstract"></head><body><article>' +
    "A".repeat(201) +
    '😀 end</article><input type="password" value="SECRET"></body>';
  const serialized = new Function(`return (${extractPage.toString()})`)() as typeof extractPage;
  const page = serialized(7, 202);
  expect(page.text).toBe("A".repeat(201));
  expect(page.textLength).toBe(201);
  expect(page.signals.visibleTextLength).toBe(207);
  expect(page.truncated).toBe(true);
  expect(page.title).toBe("Study");
  expect(page.canonicalUrl).toBe(new URL("/paper", window.location.href).href);
  expect(JSON.stringify(page)).not.toContain("SECRET");
  expect(Schema.is(PageSnapshot)(page)).toBe(true);
});
it("ignores hidden gateways and password inputs, handles malformed JSON-LD, and resolves article metadata", () => {
  document.documentElement.innerHTML =
    '<head><script type="application/ld+json">broken</script><script type="application/ld+json">{"@graph":[{"isAccessibleForFree":"false","wordCount":"1000","abstract":"Study abstract"}]}</script></head><body><div hidden><div class="paywall">Hidden</div><input type="password"></div><article>' +
    "Article ".repeat(200) +
    "</article></body>";
  const page = extractPage(3);
  expect(page.signals).toMatchObject({
    isAccessibleForFree: false,
    articleWordCount: 1000,
    paywallContainers: [],
    passwordInput: false,
  });
  expect(page.abstract).toBe("Study abstract");
});
it("falls back from an empty app shell and rejects executable canonical URLs", () => {
  document.documentElement.innerHTML =
    '<head><link rel="canonical" href="javascript:alert(1)"></head><body><main></main><p>Visible body</p></body>';
  const page = extractPage(1, -1);
  expect(page.text).toBe("Visible body");
  expect(page.canonicalUrl).toBeUndefined();
});

it("inlines exactly the shared paywall selectors", () => {
  const source = extractPage.toString();
  for (const selector of PAYWALL_SELECTORS)
    expect(source).toContain(JSON.stringify(selector).slice(1, -1));
});
