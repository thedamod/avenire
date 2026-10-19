import { CaptureId, ChunkId, ClusterId, ItemId, type SearchHit } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { describe, expect, it } from "@effect/vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import {
  metadataCandidatesStatement,
  resolveSelector,
  scoreTopicHits,
  selectorReason,
  timeWindow,
  toFileEntry,
  type MetadataCandidate,
} from "./selectors.ts";
import { ctx, fakeDatabase } from "./test-support.ts";

const now = DateTime.makeUnsafe("2026-10-09T06:30:00Z");
const candidate = (id: string): MetadataCandidate => ({
  fileId: ItemId.make(id),
  title: "Heat",
  kind: "pdf",
  mimeType: "application/pdf",
  size: 20,
  source: "upload",
  tags: ["physics"],
  createdAt: "2026-10-01T00:00:00Z",
  contentModifiedAt: "2026-10-08T20:00:00Z",
  folderName: "Thermodynamics",
  activityAt: "2026-10-09T05:00:00Z",
  events: [
    { kind: "edited", at: "2026-10-08T20:00:00Z" },
    { kind: "opened", at: "2026-10-09T05:00:00Z" },
  ],
});
const hit = (id: string, relevance: number | null): SearchHit => ({
  chunkId: ChunkId.make(`chunk-${id}`),
  itemId: ItemId.make(id),
  itemTitle: "Heat",
  itemKind: "pdf",
  chunkKind: "concept",
  content: "Heat transfer",
  location: { page: 1 },
  score: 0.01,
  relevance,
  lanes: ["semantic"],
});

describe("timeWindow", () => {
  it("today uses local midnight near a UTC date boundary", () => {
    expect(timeWindow({ today: true }, "America/Los_Angeles", now)).toEqual({
      since: "2026-10-08T07:00:00.000Z",
      until: "2026-10-09T06:30:00.000Z",
    });
  });
  it("lastDays uses elapsed days and intersects explicit bounds", () => {
    expect(timeWindow({ lastDays: 2 }, "UTC", now)).toEqual({ since: "2026-10-07T06:30:00.000Z" });
    expect(
      timeWindow(
        { lastDays: 2, today: true, since: "2026-10-08T12:00:00Z", until: "2026-10-09T04:00:00Z" },
        "America/Los_Angeles",
        now,
      ),
    ).toEqual({ since: "2026-10-08T12:00:00.000Z", until: "2026-10-09T04:00:00.000Z" });
  });
  it("respects DST midnight with the day's offset", () => {
    expect(
      timeWindow(
        { today: true },
        "America/Los_Angeles",
        DateTime.makeUnsafe("2026-11-01T10:30:00Z"),
      ),
    ).toEqual({ since: "2026-11-01T07:00:00.000Z", until: "2026-11-01T10:30:00.000Z" });
  });
});
it("renders owned metadata, overlap, activity and explicit filters with parameters", () => {
  const statement = metadataCandidatesStatement(
    ctx.userId,
    {
      filters: {
        kinds: ["pdf"],
        tags: ["physics"],
        sources: ["upload"],
        clusterIds: [ClusterId.make("folder")],
      },
      explicit: {
        itemIds: [ItemId.make("item")],
        clusterIds: [ClusterId.make("folder")],
        captureIds: [CaptureId.make("capture")],
      },
      time: { events: ["opened", "edited"] },
    },
    { since: "2026-10-08T00:00:00Z", until: "2026-10-09T00:00:00Z" },
  );
  const { sql, params } = new PgDialect().sqlToQuery(statement);
  expect(sql).toContain("i.user_id = $");
  expect(sql).toContain("i.placement <> 'archived'");
  expect(sql).toContain("i.archived_at IS NULL");
  expect(sql).toContain("i.kind = ANY(ARRAY[");
  expect(sql).toContain("i.tags && ARRAY[");
  expect(sql).toContain("e.kind = ANY(ARRAY[");
  expect(sql).toContain("ic.user_id = i.user_id");
  expect(sql).toContain("cap.user_id = i.user_id");
  expect(sql).toContain("EXISTS (SELECT 1 FROM item_event e");
  expect(sql).not.toContain("OR EXISTS (SELECT 1 FROM item_event");
  for (const value of [
    "user",
    "pdf",
    "physics",
    "upload",
    "folder",
    "item",
    "capture",
    "opened",
    "edited",
    "2026-10-08T00:00:00Z",
    "2026-10-09T00:00:00Z",
    2001,
  ])
    expect(params).toContain(value);
});
it("time without explicit event kinds includes content OR activity", () => {
  const { sql } = new PgDialect().sqlToQuery(
    metadataCandidatesStatement(ctx.userId, {}, { since: "2026-10-08T00:00:00Z" }),
  );
  expect(sql).toContain("coalesce(i.content_modified_at, i.created_at) >=");
  expect(sql).toContain("OR EXISTS (SELECT 1 FROM item_event e");
});
it("empty explicit ids select no candidates", () => {
  const { sql } = new PgDialect().sqlToQuery(
    metadataCandidatesStatement(ctx.userId, { explicit: { itemIds: [] } }, {}),
  );
  expect(sql).toContain("i.id = ANY(ARRAY[]::text[])");
});
it("drive paths preserve extensions and safely append missing ones", () => {
  expect(toFileEntry(candidate("a")).drivePath).toBe("Thermodynamics/Heat.pdf");
  expect(toFileEntry({ ...candidate("a"), title: "Heat.pdf", folderName: null }).drivePath).toBe(
    "Inbox/Heat.pdf",
  );
  expect(
    toFileEntry({ ...candidate("a"), title: "../Heat", folderName: "../Science" }).drivePath,
  ).toBe(".._Science/.._Heat.pdf");
});
it("reasons include activity, local today, topic relevance and folder", () => {
  expect(
    selectorReason(candidate("a"), { topic: { query: "thermodynamics" } }, "UTC", now, 0.82),
  ).toBe('edited 2026-10-08 · opened today · matches "thermodynamics" (0.82) · in Thermodynamics');
});
it("scores each item by its best relevance with fused rank fallback", () => {
  const scores = scoreTopicHits([hit("a", 0.4), hit("b", null), hit("a", 0.82)]);
  expect([...scores]).toEqual([
    [ItemId.make("a"), 0.82],
    [ItemId.make("b"), 0.5],
  ]);
});
for (const abstained of [false, true])
  it.effect(
    `topic ${abstained ? "abstention returns no files" : "sorts scores and filters minRelevance"}`,
    () => {
      const statements: SQL[] = [];
      const searches: Array<{ itemIds?: ReadonlyArray<ItemId> | undefined; text: string }> = [];
      const database = fakeDatabase({
        execute: async (statement: SQL) => {
          statements.push(statement);
          return [candidate("a"), candidate("b"), candidate("c")];
        },
      });
      const retrieval = Retrieval.of({
        search: (userId, query) => {
          expect(userId).toBe(ctx.userId);
          searches.push(query);
          return Effect.succeed({
            hits: abstained ? [] : [hit("a", 0.5), hit("b", 0.9), hit("c", 0.3)],
            facts: [],
            aspects: [],
            reranked: true,
            abstained,
            cached: false,
          });
        },
      });
      return Effect.gen(function* () {
        const result = yield* resolveSelector(
          ctx,
          { topic: { query: "thermodynamics", minRelevance: 0.4 } },
          { now, limit: 1 },
        );
        expect(searches[0]).toMatchObject({
          itemIds: ["a", "b", "c"],
          limit: 50,
          depth: "standard",
        });
        if (abstained) expect(result).toEqual({ files: [], truncated: false });
        else {
          expect(result.files.map((f) => f.fileId)).toEqual(["b"]);
          expect(result.truncated).toBe(true);
          expect(result.files[0]?.reason).toContain("(0.90)");
        }
        expect(statements).toHaveLength(1);
      }).pipe(
        Effect.provideService(Database, database),
        Effect.provideService(Retrieval, retrieval),
      );
    },
  );
it.effect("no topic preserves recent activity order without invoking retrieval", () =>
  Effect.gen(function* () {
    const result = yield* resolveSelector(ctx, {}, { now, limit: 200 });
    expect(result.files.map((f) => f.fileId)).toEqual(["recent", "old"]);
    expect(result.truncated).toBe(false);
  }).pipe(
    Effect.provideService(
      Database,
      fakeDatabase({ execute: async () => [candidate("recent"), candidate("old")] }),
    ),
    Effect.provideService(
      Retrieval,
      Retrieval.of({ search: () => Effect.die("retrieval must not run") }),
    ),
  ),
);
it.effect("caps candidates and batches restricted retrieval ids", () => {
  const batches: number[] = [];
  return Effect.gen(function* () {
    const result = yield* resolveSelector(ctx, { topic: { query: "heat" } }, { now, limit: 200 });
    expect(batches).toEqual([500, 500, 500, 500]);
    expect(result.files).toHaveLength(1);
    expect(result.truncated).toBe(true);
  }).pipe(
    Effect.provideService(
      Database,
      fakeDatabase({
        execute: async () => Array.from({ length: 2001 }, (_, i) => candidate(String(i))),
      }),
    ),
    Effect.provideService(
      Retrieval,
      Retrieval.of({
        search: (_userId, query) => {
          batches.push(query.itemIds?.length ?? 0);
          return Effect.succeed({
            hits: [hit("0", 0.9)],
            facts: [],
            aspects: [],
            reranked: true,
            abstained: false,
            cached: false,
          });
        },
      }),
    ),
  );
});
it.effect("rejects invalid timestamps and zones before touching the database", () =>
  Effect.gen(function* () {
    for (const [timeZone, since] of [
      ["Invalid/Zone", "2026-10-08T00:00:00Z"],
      ["UTC", "bad-time"],
    ]) {
      expect(
        yield* resolveSelector(
          { ...ctx, timeZone: timeZone! },
          { time: { since: since! } },
          { now, limit: 20 },
        ).pipe(Effect.result),
      ).toMatchObject({ failure: { code: "invalid_input" } });
    }
  }).pipe(
    Effect.provideService(Database, fakeDatabase({ execute: async () => [] })),
    Effect.provideService(Retrieval, Retrieval.of({ search: () => Effect.die("must not run") })),
  ),
);
