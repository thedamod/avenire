import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { aggregateGraph, entityKey, GraphExtractor, GraphExtractorTest } from "./extract.ts";

describe("entityKey", () => {
  it("folds articles, punctuation, and compatibility characters", () => {
    expect(entityKey("The Eigen–Value (ＥＶ)")).toBe("eigen value ev");
    expect(entityKey("an SVD")).toBe("svd");
    expect(entityKey("A")).toBe("a");
  });
});

describe("aggregateGraph", () => {
  it("deduplicates rows, keeps the longest description and most frequent type, and creates endpoints", () => {
    const result = aggregateGraph(
      {
        chunks: [
          {
            index: 0,
            entities: [
              { name: "The Singular Value Decomposition", type: "method", description: "short" },
              {
                name: "Singular Value Decomposition",
                type: "concept",
                description: "longer description",
              },
            ],
            relations: [
              {
                source: "Singular Value Decomposition",
                target: "Matrix Factorization",
                predicate: "Is A",
                description: "link",
                strength: 13,
              },
              {
                source: "Singular Value Decomposition",
                target: "Matrix Factorization",
                predicate: "Is A",
                description: "duplicate",
                strength: 2,
              },
              {
                source: "Matrix Factorization",
                target: "Matrix Factorization",
                predicate: "is",
                description: "loop",
                strength: 5,
              },
            ],
          },
          {
            index: 1,
            entities: [
              { name: "SVD", type: "method", description: "abbreviation" },
              { name: "Singular Value Decomposition", type: "method", description: "medium" },
            ],
            relations: [],
          },
          {
            index: 99,
            entities: [{ name: "Ignored", type: "concept", description: "out of range" }],
            relations: [],
          },
        ],
      },
      ["chunk-1", "chunk-2"],
    );
    expect(result.entities.find((row) => row.key === "singular value decomposition")).toEqual({
      key: "singular value decomposition",
      name: "The Singular Value Decomposition",
      type: "method",
      description: "longer description",
    });
    expect(result.entities.find((row) => row.key === "matrix factorization")).toMatchObject({
      type: "concept",
      description: "",
    });
    expect(result.entities.some((row) => row.key === "ignored")).toBe(false);
    expect(result.mentions.filter((row) => row.chunkId === "chunk-1")).toHaveLength(2);
    expect(result.relations).toEqual([
      {
        sourceKey: "singular value decomposition",
        targetKey: "matrix factorization",
        predicate: "is a",
        description: "link",
        weight: 1,
        chunkId: "chunk-1",
      },
    ]);
  });
});

it.effect("offline extractor links consecutive names in each sentence", () =>
  Effect.gen(function* () {
    const extractor = yield* GraphExtractor;
    const graph = yield* extractor.extract({
      title: "Linear algebra",
      chunks: [
        "The Singular Value Decomposition relates to Matrix Factorization. In Hilbert Space, Eigenvectors matter.",
      ],
    });
    expect(graph.chunks[0]?.entities.map((row) => row.name)).toEqual([
      "Singular Value Decomposition",
      "Matrix Factorization",
      "Hilbert Space",
      "Eigenvectors",
    ]);
    expect(graph.chunks[0]?.relations[0]).toMatchObject({
      source: "Singular Value Decomposition",
      target: "Matrix Factorization",
      predicate: "relates to",
      strength: 5,
    });
  }).pipe(Effect.provide(GraphExtractorTest)),
);
