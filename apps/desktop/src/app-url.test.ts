import { expect, it } from "vite-plus/test";
import { validateAppUrl } from "./app-url.ts";

it("accepts WSL localhost and production HTTPS origins without changing their server", () => {
  expect(validateAppUrl("http://localhost:3000")).toBe("http://localhost:3000");
  expect(validateAppUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  expect(validateAppUrl("https://avenire.example/")).toBe("https://avenire.example");
});

it("rejects credentials, nonlocal HTTP, paths and query strings", () => {
  for (const value of [
    "https://user:password@app.test",
    "http://app.test",
    "https://app.test/path",
    "https://app.test/?token=secret",
    "file:///tmp/app",
  ])
    expect(() => validateAppUrl(value)).toThrow();
});
