import { describe, expect, it, vi } from "vite-plus/test";
import { assetRequest } from "./assetRequest";

describe("mobile asset requests", () => {
  it("authenticates relative and absolute API assets", async () => {
    const cookies = vi.fn(async () => ({ Cookie: "fixture-session" }));
    expect(await assetRequest("/a/output", "https://api.test", cookies)).toEqual({
      uri: "https://api.test/a/output",
      headers: { Cookie: "fixture-session" },
    });
    expect(
      (await assetRequest("https://api.test/api/assets/output", "https://api.test", cookies))
        .headers,
    ).toEqual({ Cookie: "fixture-session" });
  });
  it("never reads or forwards the session for other origins", async () => {
    const cookies = vi.fn(async () => ({ Cookie: "fixture-session" }));
    await Promise.all(
      [
        "https://storage.test/signed",
        "https://api.test.attacker.test/a",
        "http://api.test/a",
        "https://api.test:444/a",
      ].map(async (url) =>
        expect((await assetRequest(url, "https://api.test", cookies)).headers).toEqual({}),
      ),
    );
    expect(cookies).not.toHaveBeenCalled();
  });
  it("rejects unsupported and credential-bearing URLs before accessing cookies", async () => {
    const cookies = vi.fn(async () => ({}));
    await Promise.all(
      ["javascript:alert(1)", "file:///private/file", "https://user:password@api.test/a"].map(
        (url) => expect(assetRequest(url, "https://api.test", cookies)).rejects.toThrow(),
      ),
    );
    expect(cookies).not.toHaveBeenCalled();
  });
});
