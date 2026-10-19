import { ItemId, type SearchQuery } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";

import { analyzeQuery, optionsKey } from "./query.ts";

describe("analyzeQuery", () => {
  it("removes page and elapsed time references from the search text", () => {
    const result = analyzeQuery(
      "At roughly 9:15 in lecture 1, what happens on pp. 2-4 and page 12?",
    );
    expect(result.location).toEqual({ pages: [2, 3, 4, 12], seconds: [555] });
    expect(result.text).not.toContain("9:15");
    expect(result.text).not.toContain("2-4");
    expect(result.identifiers).toEqual([]);
  });

  it("parses h:mm:ss, but leaves clock times with am or pm", () => {
    expect(analyzeQuery("See 1:02:03 and 9:15 pm").location.seconds).toEqual([3723]);
    expect(analyzeQuery("See 9:15 pm").text).toContain("9:15 pm");
  });

  it("extracts double-quoted and backtick phrases without treating apostrophes as quotes", () => {
    const result = analyzeQuery('Find "ATP synthase" and `foo.bar()` in Schmidt\'s notes');
    expect(result.phrases).toEqual(["ATP synthase", "foo.bar()"]);
    expect(result.lexical.terms).toContain("schmidt");
  });

  it("extracts code names and formulas, but not ordinary words or timestamps", () => {
    const result = analyzeQuery("renderGraphQLSchema snake_case foo.bar() and F = ma at 9:15");
    expect(result.identifiers).toEqual([
      "renderGraphQLSchema",
      "snake_case",
      "foo.bar()",
      "F = ma",
    ]);
    expect(result.identifiers).not.toContain("and");
  });

  it("preserves complete formulas with powers and subscripts", () => {
    const result = analyzeQuery("Explain E=mc^2 and x_1");
    expect(result.identifiers).toContain("E=mc^2");
    expect(result.identifiers).toContain("x_1");
  });

  it("rejects invalid elapsed timestamps", () => {
    expect(analyzeQuery("At 9:75 or 1:02:90").location.seconds).toEqual([]);
  });

  it("does not treat a lone apostrophe as a phrase delimiter", () => {
    expect(analyzeQuery("What is Noether's theorem?").phrases).toEqual([]);
  });

  it("keeps a page reference out of the lexical and identifier lists", () => {
    const result = analyzeQuery("show page 12's proof");
    expect(result.lexical.terms).not.toContain("12");
    expect(result.identifiers).toEqual([]);
  });

  it("keeps negation separate from positive terms", () => {
    const result = analyzeQuery("cells -plants and membranes");
    expect(result.lexical).toEqual({ terms: ["cells", "and", "membranes"], negated: ["plants"] });
  });

  it("falls back to the original text when all content is a location", () => {
    expect(analyzeQuery("p. 12").text).toBe("p. 12");
  });
});

describe("optionsKey", () => {
  it("is stable under filter order and changes with depth or a location", () => {
    const query: SearchQuery = { text: "cells", kinds: ["note", "pdf"], limit: 8 };
    const analysis = analyzeQuery(query.text);
    expect(optionsKey(query, analysis)).toBe(
      optionsKey({ ...query, kinds: ["pdf", "note"] }, analysis),
    );
    expect(optionsKey(query, analysis)).not.toBe(optionsKey({ ...query, depth: "deep" }, analysis));
    expect(optionsKey(query, analysis)).not.toBe(optionsKey(query, analyzeQuery("cells p. 12")));
  });
});

it("separates item and time filters in the semantic cache key", () => {
  const query: SearchQuery = { text: "cells" };
  const analysis = analyzeQuery(query.text);
  const key = optionsKey(query, analysis);
  const first = ItemId.make("first");
  const second = ItemId.make("second");
  for (const filters of [
    { itemIds: [] },
    { itemIds: [first] },
    { since: "2026-10-01T00:00:00Z" },
    { until: "2026-10-09T00:00:00Z" },
  ]) {
    expect(optionsKey({ ...query, ...filters }, analysis)).not.toBe(key);
  }
  expect(optionsKey({ ...query, itemIds: [first] }, analysis)).not.toBe(
    optionsKey({ ...query, itemIds: [second] }, analysis),
  );
  expect(optionsKey({ ...query, itemIds: [first, second] }, analysis)).toBe(
    optionsKey({ ...query, itemIds: [second, first] }, analysis),
  );
});
