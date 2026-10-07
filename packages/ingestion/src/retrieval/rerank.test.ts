import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { Reranker, RerankerTest } from "./rerank.ts";

it.effect("test reranker scores distinct query tokens", () =>
  Effect.gen(function* () {
    const reranker = yield* Reranker;
    expect(
      yield* reranker.rerank("Cell cell energy", ["Energy in a cell", "Only cell", "unrelated"]),
    ).toEqual([
      { index: 0, relevance: 1 },
      { index: 1, relevance: 0.5 },
      { index: 2, relevance: 0 },
    ]);
  }).pipe(Effect.provide(RerankerTest)),
);
