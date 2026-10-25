import { describe, expect, it } from "vite-plus/test";
import { previewContentUrl } from "./model";

describe("native preview byte capability", () => {
  it("preserves signed URL query characters through the fragment", () => {
    const url = "https://files.example.test/a/token?signature=a%2Bb%3D&expires=123";
    expect(previewContentUrl(`#${new URLSearchParams({ url })}`)).toBe(url);
  });
  it("rejects absent, relative, credential-bearing and executable URLs", () => {
    for (const url of [
      "",
      "/api/rpc",
      "javascript:alert(1)",
      "data:text/html,test",
      "file:///tmp/a.pdf",
      "https://user:password@example.test/a",
    ]) {
      expect(previewContentUrl(`#${new URLSearchParams({ url })}`)).toBeNull();
    }
    expect(previewContentUrl("")).toBeNull();
  });
});
