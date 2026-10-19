import { FileId, UserId } from "@avenire/contracts";
import * as schema from "@avenire/database/schema";
import { chunk } from "@avenire/database/schema";
import { describe, expect, it } from "@effect/vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

import { analyzeQuery } from "./query.ts";
import {
  candidateFilter,
  exactStatement,
  lexicalStatement,
  locationStatement,
  semanticStatement,
} from "./lanes.ts";

const db = drizzle.mock({ schema });
const userId = UserId.make("user");
const where = candidateFilter(userId, { text: "test" });

describe("retrieval lane builders", () => {
  it("binds ownership, file ids and exclusive content time bounds", () => {
    const ids = [FileId.make("first"), FileId.make("second")];
    const query = db
      .select({ id: chunk.id })
      .from(chunk)
      .where(
        candidateFilter(userId, {
          text: "test",
          fileIds: ids,
          since: "2026-10-01T00:00:00Z",
          until: "2026-10-09T00:00:00Z",
        }),
      )
      .toSQL();
    expect(query.sql).toContain('"chunk"."user_id" =');
    expect(query.sql).toContain('"file"."placement" <>');
    expect(query.sql).toContain('"file"."id" in');
    expect(query.sql).toContain('coalesce("file"."content_modified_at", "file"."created_at") >=');
    expect(query.sql).toContain('coalesce("file"."content_modified_at", "file"."created_at") <');
    expect(query.params).toContain(userId);
    expect(query.params).toContain(ids[0]);
    expect(query.params.some((value) => value instanceof Date)).toBe(true);
  });

  it("matches nothing for an explicit empty file list", () => {
    const query = db
      .select({ id: chunk.id })
      .from(chunk)
      .where(candidateFilter(userId, { text: "test", fileIds: [] }))
      .toSQL();
    expect(query.sql).toContain("false");
  });

  it("keeps HNSW cosine order and the 50-result inner limit", () => {
    const query = semanticStatement(db, where, "model", [0, 1]).toSQL();
    expect(query.sql).toContain('with "nearest" as');
    expect(query.sql).toContain('"chunk"."embedding" <=>');
    expect(query.sql).toContain('"chunk"."embedding_model" =');
    expect(query.sql).toContain('order by "chunk"."embedding" <=>');
    expect(query.sql).toContain('order by "distance"');
    expect(query.params).toContain(50);
  });

  it("keeps tsvector matching and cover-density ranking", () => {
    const query = lexicalStatement(
      db,
      where,
      sql`plainto_tsquery('english', ${"physics"})`,
    ).toSQL();
    expect(query.sql).toContain('"chunk"."search" @@');
    expect(query.sql).toContain('ts_rank_cd("chunk"."search"');
    expect(query.params).toContain(50);
  });

  it("keeps trigram-compatible LIKE and match-count ranking", () => {
    const match = sql`(${chunk.contentNorm} LIKE ${"%physics%"} ESCAPE '\\')`;
    const query = exactStatement(db, where, [match]).toSQL();
    expect(query.sql).toContain('"chunk"."content_norm" LIKE');
    expect(query.sql).toContain("::int");
    expect(query.sql).toContain('"file"."updated_at" desc');
    expect(query.params).toContain(50);
  });

  it("keeps page and time location filters, distance order and limit", () => {
    const query = locationStatement(db, where, analyzeQuery("page 2 01:30")).toSQL();
    expect(query.sql).toContain("'page'");
    expect(query.sql).toContain("'startSec'");
    expect(query.sql).toContain("'endSec'");
    expect(query.sql).toContain("least(");
    expect(query.sql).toContain('"chunk"."ordinal"');
    expect(query.params).toContain(50);
  });
});
