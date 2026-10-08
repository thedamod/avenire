import * as Schema from "effect/Schema";

const SourceType = Schema.Literals([
  "pdf",
  "image",
  "video",
  "audio",
  "document",
  "markdown",
  "link",
]);
const QueryFamily = Schema.Literals([
  "direct-fact",
  "paraphrase",
  "exact-identifier",
  "table-cell",
  "formula-chart",
  "timestamp",
  "visual-only",
  "cross-file",
  "multi-hop",
  "near-duplicate",
  "conflicting-revision",
  "source-filtered",
  "unanswerable",
]);
const Locator = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("document") }),
  Schema.Struct({ kind: Schema.Literal("page"), page: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("slide"), slide: Schema.Number }),
  Schema.Struct({
    kind: Schema.Literal("sheet"),
    sheet: Schema.String,
    cell: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal("time"), startMs: Schema.Number, endMs: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("text"), needle: Schema.String }),
]);
const Derivation = Schema.Struct({
  kind: Schema.Literal("media-clip"),
  startMs: Schema.Number,
  endMs: Schema.Number,
  serialOffset: Schema.optionalKey(Schema.Number),
});
const Artifact = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sourceType: SourceType,
  format: Schema.String,
  path: Schema.String,
  mimeType: Schema.String,
  byteSize: Schema.Number,
  sha256: Schema.String,
  downloadUrl: Schema.optionalKey(Schema.String),
  upstreamByteSize: Schema.optionalKey(Schema.Number),
  upstreamSha256: Schema.optionalKey(Schema.String),
  derivation: Schema.optionalKey(Derivation),
  canonicalUrl: Schema.optionalKey(Schema.String),
});
export const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  corpusId: Schema.String,
  version: Schema.String,
  artifacts: Schema.Array(Artifact),
});
export const Dataset = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  version: Schema.optionalKey(Schema.String),
  evidence: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      artifactId: Schema.String,
      locator: Locator,
    }),
  ),
  queries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      text: Schema.String,
      family: QueryFamily,
      split: Schema.Literals(["development", "test"]),
      requiredEvidenceGroups: Schema.Array(Schema.Array(Schema.String)),
    }),
  ),
  judgments: Schema.Array(
    Schema.Struct({
      queryId: Schema.String,
      evidenceId: Schema.String,
      grade: Schema.Literals([0, 1, 2, 3]),
    }),
  ),
});
export type CorpusManifest = typeof Manifest.Type;
export type BenchmarkDataset = typeof Dataset.Type;
export type BenchmarkArtifact = CorpusManifest["artifacts"][number];
export type EvidenceLocator = BenchmarkDataset["evidence"][number]["locator"];
