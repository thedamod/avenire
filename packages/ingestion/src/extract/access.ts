import type { AccessSignals, SourceAccess } from "@avenire/contracts";
import { classifyAccess, PAYWALL_SELECTORS } from "@avenire/capture/access";
import { parseHTML } from "linkedom";

/** Server HTML has no layout engine. Exclude explicitly hidden and non-content nodes. */
export const htmlAccessSignals = (html: string): AccessSignals => {
  const { document } = parseHTML(html);
  const structured = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => node.textContent ?? "")
    .join("\n");
  const isAccessibleForFree = /"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(structured)
    ? false
    : undefined;
  const count = structured.match(/"wordCount"\s*:\s*"?(\d+)/i)?.[1];
  for (const node of document.querySelectorAll(
    'script,style,noscript,template,[hidden],[aria-hidden="true"]',
  ))
    node.remove();
  for (const node of document.querySelectorAll("[style]"))
    if (
      /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/i.test(
        node.getAttribute("style") ?? "",
      )
    )
      node.remove();
  const body = document.querySelector("article,main,[role=main]") ?? document.body;
  const text = (
    body?.textContent ||
    document.documentElement?.textContent ||
    html.replace(/<[^>]*>/g, " ")
  ).trim();
  const paywallContainers: string[] = PAYWALL_SELECTORS.filter((selector) =>
    document.querySelector(selector),
  );
  if (
    text.length < 1000 &&
    /subscribe to (?:read|continue)|subscription required|behind (?:a |the )?paywall/i.test(text)
  )
    paywallContainers.push("subscription-message");
  return {
    visibleTextLength: text.length,
    paywallContainers,
    passwordInput:
      document.querySelector('input[type="password"]') !== null ||
      (text.length < 1000 &&
        /(?:sign|log)\s*in\s+(?:to|is required)|login required|authentication required/i.test(
          text,
        )),
    ...(isAccessibleForFree === undefined ? {} : { isAccessibleForFree }),
    ...(count === undefined ? {} : { articleWordCount: Number(count) }),
  };
};

export const htmlAccess = (html: string): SourceAccess => classifyAccess(htmlAccessSignals(html));

/** A bare forbidden response is not evidence of an account or subscription wall. */
export const accessForHttp = (status: number, html?: string): SourceAccess | undefined => {
  const signals =
    html === undefined
      ? {
          visibleTextLength: 0,
          paywallContainers: [],
          passwordInput: false,
        }
      : htmlAccessSignals(html);
  if (status === 403) {
    const access = classifyAccess(signals);
    return access === "open" ? undefined : access;
  }
  if (status === 401 || status === 402) return classifyAccess({ ...signals, httpStatus: status });
  return status >= 200 && status < 300 && html !== undefined ? classifyAccess(signals) : undefined;
};

/** Only source acquisition observations count; provider authentication failures do not. */
export const failureAccess = (failure: unknown): SourceAccess | undefined => {
  const seen = new Set<unknown>();
  let current = failure;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const error = current as {
      _tag?: string;
      access?: SourceAccess;
      status?: number;
      cause?: unknown;
      lastError?: unknown;
    };
    if (error._tag === "SourceAccessError") return error.access;
    if (error._tag === "AcquisitionError")
      return error.access ?? (error.status === undefined ? undefined : accessForHttp(error.status));
    current = error.lastError ?? error.cause;
  }
  return undefined;
};
