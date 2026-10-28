import type { PageSnapshot } from "@avenire/contracts";

/** Serialized by executeScript: keep every runtime dependency inside this function. */
export function extractPage(
  tabId: number,
  maxChars = 1_500_000,
  doc?: Document,
  win?: Window,
): PageSnapshot {
  const d = doc ?? document;
  const w = win ?? window;
  const cap =
    Number.isFinite(maxChars) && maxChars > 0
      ? Math.max(1, Math.min(Math.floor(maxChars), 1_500_000))
      : 1_500_000;
  const collapse = (text: string) =>
    text
      .replace(/[ \t\f\v\u00a0\u200b]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const attr = (selector: string, name: string) =>
    d.querySelector(selector)?.getAttribute(name)?.trim() ?? "";
  const visible = (element: Element) => {
    for (let parent: Element | null = element; parent; parent = parent.parentElement) {
      const style = w.getComputedStyle(parent);
      if (
        parent.hasAttribute("hidden") ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.opacity === "0"
      )
        return false;
    }
    return true;
  };
  const textOf = (element: Element | null) =>
    element && visible(element) ? collapse((element as HTMLElement).innerText ?? "") : "";
  let text = "";
  for (const selector of ["article", "main", '[role="main"]']) {
    const content = textOf(d.querySelector(selector));
    if (content.length >= 200) {
      text = content;
      break;
    }
  }
  if (!text) text = textOf(d.body);
  const visibleTextLength = text.length;
  const truncated = text.length > cap;
  text = text.slice(0, cap);
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);

  let canonicalUrl: string | undefined;
  const canonical = attr('link[rel="canonical"]', "href");
  if (canonical) {
    try {
      const url = new URL(canonical, w.location.href);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password)
        canonicalUrl = url.href.slice(0, 8192);
    } catch {
      /* An invalid canonical must not discard the rendered page. */
    }
  }
  let isAccessibleForFree: boolean | undefined;
  let articleWordCount: number | undefined;
  let abstract: string | undefined;
  for (const script of [...d.querySelectorAll('script[type="application/ld+json"]')].slice(0, 32)) {
    const raw = script.textContent ?? "";
    if (raw.length > 1_000_000) continue;
    try {
      const stack: unknown[] = [JSON.parse(raw)];
      for (let visited = 0; stack.length && visited < 10000; visited++) {
        const item = stack.pop();
        if (!item || typeof item !== "object") continue;
        if (Array.isArray(item)) {
          stack.push(...item.slice(0, 1000));
          continue;
        }
        const record = item as Record<string, unknown>;
        if (record.isAccessibleForFree === false || record.isAccessibleForFree === "false")
          isAccessibleForFree = false;
        else if (
          isAccessibleForFree === undefined &&
          (record.isAccessibleForFree === true || record.isAccessibleForFree === "true")
        )
          isAccessibleForFree = true;
        const count =
          typeof record.wordCount === "string" ? Number(record.wordCount) : record.wordCount;
        if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0)
          articleWordCount = Math.max(articleWordCount ?? 0, count);
        if (typeof record.abstract === "string") abstract = record.abstract.slice(0, 10000);
        stack.push(
          ...Object.values(record)
            .filter((value) => value !== null && typeof value === "object")
            .slice(0, 1000),
        );
      }
    } catch {
      /* Publishers sometimes emit malformed JSON-LD alongside valid scripts. */
    }
  }
  const selectors = [
    ".tp-modal",
    ".tp-backdrop",
    '[id^="piano-"]',
    ".tinypass",
    "[data-paywall]",
    ".paywall",
    ".meteredContent",
    "[data-testid=paywall]",
    ".paywall-title",
    ".paywall-content",
    ".subscribe-wall",
    "#gateway-content",
    "#standalone-footer",
    ".wsj-snippet-login",
    ".snippet-promotion",
    ".n-content-paywall",
  ];
  const paywallContainers = selectors.filter((selector) =>
    [...d.querySelectorAll(selector)].some(visible),
  );
  return {
    tabId,
    url: w.location.href.slice(0, 8192),
    title: d.title.trim().slice(0, 2000),
    ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
    description: (
      attr('meta[name="description"]', "content") ||
      attr('meta[property="og:description"]', "content")
    ).slice(0, 5000),
    ...(abstract === undefined ? {} : { abstract }),
    language: (d.documentElement.lang ?? "").slice(0, 35),
    text,
    textLength: text.length,
    truncated,
    signals: {
      visibleTextLength,
      ...(isAccessibleForFree === undefined ? {} : { isAccessibleForFree }),
      ...(articleWordCount === undefined ? {} : { articleWordCount }),
      paywallContainers,
      passwordInput: [...d.querySelectorAll('input[type="password"]')].some(visible),
    },
  };
}
