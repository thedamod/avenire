/** Candidate lanes share one ownership and file filter. Each returns at most 50 chunks. */
import {
  ChunkId,
  ChunkKind,
  ChunkLocation,
  FileId,
  FileKind,
  type SearchQuery,
  type UserId,
} from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { chunk, file, fileFolder, schema } from "@avenire/database/schema";
import {
  and,
  cosineDistance,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { normalizeForMatch } from "../text.ts";
import type { QueryAnalysis } from "./query.ts";

export const LANE_LIMIT = 50;
const TIME_TOLERANCE_SEC = 20;

const CandidateRow = Schema.Struct({
  chunkId: ChunkId,
  fileId: FileId,
  fileTitle: Schema.String,
  fileKind: FileKind,
  chunkKind: ChunkKind,
  ordinal: Schema.Number,
  content: Schema.String,
  location: ChunkLocation,
});
export type CandidateRow = typeof CandidateRow.Type;
const decodeCandidates = Schema.decodeUnknownEffect(Schema.Array(CandidateRow));

const columns = {
  chunkId: chunk.id,
  fileId: file.id,
  fileTitle: file.title,
  fileKind: file.kind,
  chunkKind: chunk.kind,
  ordinal: chunk.ordinal,
  content: chunk.content,
  location: chunk.location,
};
const source = (db: DatabaseClient) =>
  db
    .select(columns)
    .from(chunk)
    .innerJoin(file, and(eq(file.id, chunk.fileId), eq(file.userId, chunk.userId)));
const contentDate = sql<Date>`coalesce(${file.contentModifiedAt}, ${file.createdAt})`;
const builder = drizzle.mock({ schema });

/** The user's searchable chunks, restricted by every file and content-time filter. */
export const candidateFilter = (userId: UserId, query: SearchQuery): SQL =>
  and(
    eq(chunk.userId, userId),
    eq(file.userId, userId),
    ne(file.placement, "archived"),
    ...(query.kinds?.length ? [inArray(file.kind, query.kinds)] : []),
    ...(query.folderIds?.length
      ? [
          exists(
            builder
              .select({ fileId: fileFolder.fileId })
              .from(fileFolder)
              .where(
                and(
                  eq(fileFolder.fileId, file.id),
                  eq(fileFolder.userId, userId),
                  inArray(fileFolder.folderId, query.folderIds),
                ),
              ),
          ),
        ]
      : []),
    ...(query.fileIds === undefined
      ? []
      : [query.fileIds.length ? inArray(file.id, query.fileIds) : sql`false`]),
    ...(query.since === undefined ? [] : [gte(contentDate, new Date(query.since))]),
    ...(query.until === undefined ? [] : [lt(contentDate, new Date(query.until))]),
  )!;

const candidates = (build: (db: DatabaseClient) => Promise<unknown>) =>
  Effect.flatMap(Effect.service(Database), (database) => database.use(build)).pipe(
    Effect.flatMap(decodeCandidates),
  );
const none = Effect.succeed<ReadonlyArray<CandidateRow>>([]);

/** Iterative HNSW scans compensate for ownership filters applied after ANN lookup. */
export const semanticStatement = (
  db: DatabaseClient,
  where: SQL,
  model: string,
  vector: ReadonlyArray<number>,
) => {
  const distance = cosineDistance(chunk.embedding, [...vector]).as("distance");
  const nearest = db.$with("nearest").as(
    db
      .select({
        chunkId: sql<string>`${chunk.id}`.as("chunkId"),
        fileId: sql<string>`${file.id}`.as("fileId"),
        fileTitle: sql<string>`${file.title}`.as("fileTitle"),
        fileKind: sql<FileKind>`${file.kind}`.as("fileKind"),
        chunkKind: sql<ChunkKind>`${chunk.kind}`.as("chunkKind"),
        ordinal: chunk.ordinal,
        content: chunk.content,
        location: chunk.location,
        distance,
      })
      .from(chunk)
      .innerJoin(file, and(eq(file.id, chunk.fileId), eq(file.userId, chunk.userId)))
      .where(and(where, isNotNull(chunk.embedding), eq(chunk.embeddingModel, model)))
      .orderBy(cosineDistance(chunk.embedding, [...vector]))
      .limit(LANE_LIMIT),
  );
  // The inner LIMIT fixes the candidate set before the outer ordering.
  return db
    .with(nearest)
    .select({
      chunkId: nearest.chunkId,
      fileId: nearest.fileId,
      fileTitle: nearest.fileTitle,
      fileKind: nearest.fileKind,
      chunkKind: nearest.chunkKind,
      ordinal: nearest.ordinal,
      content: nearest.content,
      location: nearest.location,
    })
    .from(nearest)
    .orderBy(nearest.distance);
};

export const semanticLane = (where: SQL, model: string, vector: ReadonlyArray<number>) =>
  Effect.flatMap(Effect.service(Database), (database) =>
    database.useTransaction(async (tx) => {
      await tx.select({
        scan: sql`set_config('hnsw.iterative_scan', 'relaxed_order', true)`,
        ef: sql`set_config('hnsw.ef_search', '200', true)`,
      });
      return semanticStatement(tx as DatabaseClient, where, model, vector);
    }),
  ).pipe(Effect.flatMap(decodeCandidates));

/** `(a | b | "c d") & !e`; tsquery composition has no Drizzle API. */
const tsQuery = (analysis: QueryAnalysis): SQL | undefined => {
  const positive = [
    ...analysis.lexical.terms.map((term) => sql`plainto_tsquery('english', ${term})`),
    ...analysis.phrases.map((phrase) => sql`phraseto_tsquery('english', ${phrase})`),
  ];
  if (positive.length === 0) return undefined;
  return analysis.lexical.negated.reduce<SQL>(
    (query, term) => sql`(${query} && !!plainto_tsquery('english', ${term}))`,
    sql`(${sql.join(positive, sql` || `)})`,
  );
};

export const lexicalStatement = (db: DatabaseClient, where: SQL, query: SQL) =>
  source(db)
    .where(and(where, sql`${chunk.search} @@ ${query}`))
    .orderBy(sql`ts_rank_cd(${chunk.search}, ${query}) desc`)
    .limit(LANE_LIMIT);
export const lexicalLane = (where: SQL, analysis: QueryAnalysis) => {
  const query = tsQuery(analysis);
  return query === undefined ? none : candidates((db) => lexicalStatement(db, where, query));
};

const likePattern = (value: string): string =>
  `%${normalizeForMatch(value).replace(/[\\%_]/gu, "\\$&")}%`;
const exactMatches = (analysis: QueryAnalysis) =>
  [...analysis.phrases, ...analysis.identifiers].map(
    (value) => sql`(${chunk.contentNorm} LIKE ${likePattern(value)} ESCAPE '\\')`,
  );
export const exactStatement = (db: DatabaseClient, where: SQL, matches: SQL[]) =>
  source(db)
    .where(and(where, or(...matches)))
    .orderBy(
      sql`${sql.join(
        matches.map((match) => sql`(${match})::int`),
        sql` + `,
      )} desc`,
      sql`${file.updatedAt} desc`,
    )
    .limit(LANE_LIMIT);
export const exactLane = (where: SQL, analysis: QueryAnalysis) => {
  const matches = exactMatches(analysis);
  return matches.length === 0 ? none : candidates((db) => exactStatement(db, where, matches));
};

const list = (values: ReadonlyArray<string | number>) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
export const locationStatement = (db: DatabaseClient, where: SQL, analysis: QueryAnalysis) => {
  const { pages, seconds } = analysis.location;
  const start = sql`(${chunk.location}->>'startSec')::float`;
  const end = sql`coalesce((${chunk.location}->>'endSec')::float, ${start})`;
  const onPage = pages.length
    ? sql`(${chunk.location}->>'page')::int IN (${list(pages)})`
    : sql`false`;
  const nearTime = seconds.length
    ? sql.join(
        seconds.map(
          (second) =>
            sql`${second} BETWEEN ${start} - ${TIME_TOLERANCE_SEC} AND ${end} + ${TIME_TOLERANCE_SEC}`,
        ),
        sql` OR `,
      )
    : sql`false`;
  const distance = seconds.length
    ? sql`least(${sql.join(
        seconds.map((second) => sql`abs(${second} - (${start} + ${end}) / 2)`),
        sql`, `,
      )})`
    : sql`0::float8`;
  return source(db)
    .where(and(where, sql`(${onPage} OR ${nearTime})`))
    .orderBy(distance, chunk.ordinal)
    .limit(LANE_LIMIT);
};
export const locationLane = (where: SQL, analysis: QueryAnalysis) =>
  analysis.location.pages.length === 0 && analysis.location.seconds.length === 0
    ? none
    : candidates((db) => locationStatement(db, where, analysis));

export const hydrate = (where: SQL, ids: ReadonlyArray<ChunkId>) =>
  ids.length === 0
    ? none
    : candidates((db) => source(db).where(and(where, inArray(chunk.id, ids)))).pipe(
        Effect.map((rows) => {
          const byId = new Map(rows.map((row) => [row.chunkId, row]));
          return ids.flatMap((id) => byId.get(id) ?? []);
        }),
      );

const NeighbourRow = Schema.Struct({
  fileId: Schema.String,
  ordinal: Schema.Number,
  content: Schema.String,
});
const decodeNeighbours = Schema.decodeUnknownEffect(Schema.Array(NeighbourRow));
export const neighbours = (
  where: SQL,
  wanted: ReadonlyArray<{ readonly fileId: string; readonly ordinal: number }>,
) =>
  wanted.length === 0
    ? Effect.succeed<ReadonlyArray<typeof NeighbourRow.Type>>([])
    : Effect.flatMap(Effect.service(Database), (database) =>
        database.use((db) =>
          db
            .select({ fileId: chunk.fileId, ordinal: chunk.ordinal, content: chunk.content })
            .from(chunk)
            .innerJoin(file, and(eq(file.id, chunk.fileId), eq(file.userId, chunk.userId)))
            .where(
              and(
                where,
                or(
                  ...wanted.map(({ fileId, ordinal }) =>
                    and(eq(chunk.fileId, fileId), eq(chunk.ordinal, ordinal)),
                  ),
                ),
              ),
            ),
        ),
      ).pipe(Effect.flatMap(decodeNeighbours));
