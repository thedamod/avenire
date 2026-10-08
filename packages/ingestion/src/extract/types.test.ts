import { describe, expect, it } from "@effect/vitest";

import { storableDocument } from "./types.ts";

describe("storableDocument", () => {
  it("removes NUL characters and lone surrogates, and drops emptied sections", () => {
    const document = storableDocument({
      title: "Paper\u0000",
      sections: [
        { text: "eigen\u0000value \uD800", location: { page: 1 } },
        { text: "\u0000\u0000", location: { page: 2 } },
      ],
      coverage: { status: "full", parts: [] },
    });
    expect(document.title).toBe("Paper");
    expect(document.sections).toEqual([{ text: "eigenvalue �", location: { page: 1 } }]);
  });
});
