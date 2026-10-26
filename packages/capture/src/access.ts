import type { AccessSignals, SourceAccess } from "@avenire/contracts";

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
