import { describe, expect, it } from "vite-plus/test";
import { safeCallbackURL } from "./auth-utils";

describe("auth callback destinations", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5cevil.example",
    "/\nevil.example",
    "/sign-in?callbackURL=/",
    "/%invalid",
  ])("rejects unsafe or looping destination %s", (value) => {
    expect(safeCallbackURL(value)).toBe("/");
  });
  it("preserves a local destination with its query and anchor", () => {
    expect(safeCallbackURL("/sources/source-id?page=4#citation")).toBe(
      "/sources/source-id?page=4#citation",
    );
  });
  it("defaults missing destinations to home", () => expect(safeCallbackURL(null)).toBe("/"));
});
