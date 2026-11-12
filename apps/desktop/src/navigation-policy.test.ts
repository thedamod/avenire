import { describe, expect, it } from "vite-plus/test";
import { externalUrl, isAppUrl, isAssetUrl } from "./navigation-policy.ts";

const origin = "https://app.avenire.space";
describe("desktop navigation boundaries", () => {
  it("permits only credential-free HTTP(S) external links", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,hi",
      "mailto:a@b.com",
      "https://u:p@example.com",
      "invalid",
    ]) {
      expect(externalUrl(url)).toBeUndefined();
    }
    expect(externalUrl("https://example.com/path")).toBe("https://example.com/path");
  });
  it("requires exact app origin and intentional authenticated asset routes", () => {
    expect(isAppUrl(`${origin}/inbox`, origin)).toBe(true);
    expect(isAppUrl("https://app.avenire.space.evil.test/inbox", origin)).toBe(false);
    expect(isAssetUrl(`${origin}/a/token.signature`, origin)).toBe(true);
    for (const path of ["/settings", "/a/", "/a/token.signature/extra", "/a/%2f.signature"]) {
      expect(isAssetUrl(`${origin}${path}`, origin)).toBe(false);
    }
  });
});
