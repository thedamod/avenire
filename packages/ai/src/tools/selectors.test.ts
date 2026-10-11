import { CaptureId, ChunkId, FolderId, FileId, type SearchHit } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { describe, expect, it } from "@effect/vitest";
import { type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as dbSchema from "@avenire/database/schema";
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
  fileId: FileId.make(id),
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
  fileId: FileId.make(id),
  fileTitle: "Heat",
  fileKind: "pdf",
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
const builder = drizzle.mock({ schema: dbSchema });
it("renders owned metadata, overlap, activity and explicit filters with parameters", () => {
  const { sql, params } = metadataCandidatesStatement(
    builder,
    ctx.userId,
    {
      filters: {
        kinds: ["pdf"],
        tags: ["physics"],
        sources: ["upload"],
        folderIds: [FolderId.make("folder")],
      },
      explicit: {
        fileIds: [FileId.make("file")],
        folderIds: [FolderId.make("folder")],
        captureIds: [CaptureId.make("capture")],
      },
      time: { events: ["opened", "edited"] },
    },
    { since: "2026-10-08T00:00:00Z", until: "2026-10-09T00:00:00Z" },
  ).toSQL();
  for (const name of [
    "file_folder",
    "capture",
    "file_event",
    "chosen_folder",
    "activity",
    "events",
  ])
    expect(sql).toContain(name);
  expect(sql).toContain('"file"."user_id" =');
  expect(sql).toContain('"file"."placement" <>');
  expect(sql).toContain('"file"."archived_at" is null');
  expect(sql).toContain('"file"."tags" &&');
  expect(sql).toContain('"file_event"."kind" in');
  expect(sql).toContain("jsonb_agg");
  expect(sql).toContain("greatest");
  for (const value of [
    "user",
    "pdf",
    "physics",
    "upload",
    "folder",
    "file",
    "capture",
    "opened",
    "edited",
    2001,
  ])
    expect(params).toContain(value);
  expect(
    params.some((value) => value instanceof Date && value.toISOString().startsWith("2026-10-08")),
  ).toBe(true);
});
it("time without explicit event kinds includes content OR activity", () => {
  const { sql } = metadataCandidatesStatement(
    builder,
    ctx.userId,
    {},
    { since: "2026-10-08T00:00:00Z" },
  ).toSQL();
  expect(sql).toContain('coalesce("file"."content_modified_at", "file"."created_at") >=');
  expect(sql).toContain("or exists");
});
it("empty explicit ids select no candidates", () => {
  const { sql } = metadataCandidatesStatement(
    builder,
    ctx.userId,
    { explicit: { fileIds: [] } },
    {},
  ).toSQL();
  expect(sql).toContain("false");
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
it("scores each file by its best relevance with fused rank fallback", () => {
  const scores = scoreTopicHits([hit("a", 0.4), hit("b", null), hit("a", 0.82)]);
  expect([...scores]).toEqual([
    [FileId.make("a"), 0.82],
    [FileId.make("b"), 0.5],
  ]);
});
for (const abstained of [false, true])
  it.effect(
    `topic ${abstained ? "abstention returns no files" : "sorts scores and filters minRelevance"}`,
    () => {
      const statements: SQL[] = [];
      const searches: Array<{ fileIds?: ReadonlyArray<FileId> | undefined; text: string }> = [];
      const database = fakeDatabase({
        recordStatement: async (statement: SQL) => {
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
          fileIds: ["a", "b", "c"],
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
      fakeDatabase({ recordStatement: async () => [candidate("recent"), candidate("old")] }),
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
        recordStatement: async () => Array.from({ length: 2001 }, (_, i) => candidate(String(i))),
      }),
    ),
    Effect.provideService(
      Retrieval,
      Retrieval.of({
        search: (_userId, query) => {
          batches.push(query.fileIds?.length ?? 0);
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
    Effect.provideService(Database, fakeDatabase({ recordStatement: async () => [] })),
    Effect.provideService(Retrieval, Retrieval.of({ search: () => Effect.die("must not run") })),
  ),
);
