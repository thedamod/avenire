import type { AccessSignals, SourceAccess } from "@avenire/contracts";

/**
 * Known paywall and metering containers. `extractPage` inlines the same list because
 * executeScript serializes it without imports; extract.test.ts keeps the two in sync.
 */
export const PAYWALL_SELECTORS = [
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
] as const;

export function classifyAccess(signals: AccessSignals): SourceAccess {
  if (signals.httpStatus === 401 || signals.httpStatus === 403) return "login-required";
  if (signals.httpStatus === 402) return "paywalled";
  const short = signals.visibleTextLength < 1000;
  const incomplete =
    signals.articleWordCount !== undefined &&
    signals.articleWordCount > 0 &&
    signals.visibleTextLength < signals.articleWordCount * 5 * 0.4;
  if (signals.passwordInput && short) return "login-required";
  // Subscriber pages keep their paywall markup and metadata; only missing text means blocked.
  if (
    (signals.paywallContainers.length > 0 || signals.isAccessibleForFree === false) &&
    (short || incomplete)
  )
    return "paywalled";
  return "open";
}
