// @vitest-environment happy-dom
import { expect, it } from "vite-plus/test";
import type { AccessSignals } from "@avenire/contracts";
import { classifyAccess } from "./access.ts";
import { extractPage } from "./extract.ts";
import jsonLd from "./fixtures/json-ld.html?raw";
import piano from "./fixtures/piano.html?raw";
import tinyPass from "./fixtures/tinypass.html?raw";
import substack from "./fixtures/substack.html?raw";
import medium from "./fixtures/medium.html?raw";
import login from "./fixtures/login.html?raw";
import open from "./fixtures/open.html?raw";
import nyt from "./fixtures/nyt.html?raw";
import wsj from "./fixtures/wsj.html?raw";
import ft from "./fixtures/ft.html?raw";

it.each([
  ["JSON-LD", jsonLd, "paywalled"],
  ["Piano", piano, "paywalled"],
  ["TinyPass", tinyPass, "paywalled"],
  ["Substack", substack, "paywalled"],
  ["Medium", medium, "paywalled"],
  ["login", login, "login-required"],
  ["NYT", nyt, "paywalled"],
  ["WSJ", wsj, "paywalled"],
  ["FT", ft, "paywalled"],
  ["open article", open, "open"],
])("classifies the %s HTML fixture", (_, html, expected) => {
  document.documentElement.innerHTML = html;
  expect(classifyAccess(extractPage(1).signals)).toBe(expected);
});
const signals: AccessSignals = {
  visibleTextLength: 10000,
  paywallContainers: [],
  passwordInput: false,
};
it.each([
  [401, "login-required"],
  [402, "paywalled"],
  [403, "login-required"],
] as const)("uses HTTP %s over DOM heuristics", (httpStatus, expected) =>
  expect(classifyAccess({ ...signals, httpStatus })).toBe(expected),
);
it("keeps a subscriber's fully visible article open; short text alone is coverage, not access", () => {
  expect(classifyAccess({ ...signals, isAccessibleForFree: false, articleWordCount: 2000 })).toBe(
    "open",
  );
  expect(classifyAccess({ ...signals, visibleTextLength: 1500, articleWordCount: 2000 })).toBe(
    "open",
  );
  expect(classifyAccess({ ...signals, paywallContainers: [".paywall"] })).toBe("open");
  expect(
    classifyAccess({
      ...signals,
      paywallContainers: [".paywall"],
      visibleTextLength: 1500,
      articleWordCount: 2000,
    }),
  ).toBe("paywalled");
  expect(classifyAccess({ ...signals, passwordInput: true })).toBe("open");
});
