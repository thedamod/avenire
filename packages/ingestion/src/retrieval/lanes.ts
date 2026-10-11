/**
 * The SQL candidate lanes. Each returns at most `LANE_LIMIT` chunks, best first,
 * restricted by the shared `candidateFilter`.
 */
import {
  ChunkId,
  ChunkKind,
  ChunkLocation,
  FileId,
  FileKind,
  type SearchQuery,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { type SQL, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { normalizeForMatch, toVectorLiteral } from "../text.ts";
import type { QueryAnalysis } from "./query.ts";

export const LANE_LIMIT = 50;
/** A timestamp matches chunks whose range is within this many seconds of it. */
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

const COLUMNS = sql`c.id AS "chunkId", i.id AS "fileId", i.title AS "fileTitle",
  i.kind AS "fileKind", c.kind AS "chunkKind", c.ordinal, c.content, c.location`;
const SOURCE = sql`FROM chunk c JOIN file i ON i.id = c.file_id AND i.user_id = c.user_id`;

const list = (values: ReadonlyArray<string | number>) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** The user's searchable chunks, restricted by every file and content-time filter. */
export const candidateFilter = (userId: UserId, query: SearchQuery): SQL => {
  const kinds = query.kinds?.length ? sql` AND i.kind IN (${list(query.kinds)})` : sql``;
  const folders = query.folderIds?.length
    ? sql` AND EXISTS (SELECT 1 FROM file_folder ic
        WHERE ic.file_id = i.id AND ic.user_id = ${userId}
          AND ic.folder_id IN (${list(query.folderIds)}))`
    : sql``;
  const files =
    query.fileIds === undefined
      ? sql``
      : query.fileIds.length === 0
        ? sql` AND false`
        : sql` AND i.id IN (${list(query.fileIds)})`;
  const since =
    query.since === undefined
      ? sql``
      : sql` AND coalesce(i.content_modified_at, i.created_at) >= ${query.since}::timestamptz`;
  const until =
    query.until === undefined
      ? sql``
      : sql` AND coalesce(i.content_modified_at, i.created_at) < ${query.until}::timestamptz`;
  return sql`c.user_id = ${userId} AND i.user_id = ${userId} AND i.placement <> 'archived'${kinds}${folders}${files}${since}${until}`;
};

const candidates = (statement: SQL) =>
  Effect.flatMap(Effect.service(Database), (database) =>
    database.use((db) => db.execute(statement)),
  ).pipe(Effect.flatMap(decodeCandidates));

const none = Effect.succeed<ReadonlyArray<CandidateRow>>([]);

// HNSW filters after finding neighbours, so a per-user WHERE can return far fewer
// than LIMIT rows once other users' chunks dominate. pgvector >= 0.8 iterative scans
// keep searching until enough rows pass; relaxed order is re-sorted outside the CTE.
export const semanticLane = (where: SQL, model: string, vector: ReadonlyArray<number>) =>
  Effect.flatMap(Effect.service(Database), (database) =>
    database.useTransaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true),
        set_config('hnsw.ef_search', '200', true)`);
      return tx.execute(sql`
        WITH nearest AS MATERIALIZED (
          SELECT ${COLUMNS}, c.embedding <=> ${toVectorLiteral(vector)}::vector AS distance
          ${SOURCE}
          WHERE ${where} AND c.embedding IS NOT NULL AND c.embedding_model = ${model}
          ORDER BY distance LIMIT ${LANE_LIMIT}
        )
        SELECT * FROM nearest ORDER BY distance`);
    }),
  ).pipe(Effect.flatMap(decodeCandidates));

/** `(a | b | "c d") & !e`, built from parts so negation stays a negation. */
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

export const lexicalLane = (where: SQL, analysis: QueryAnalysis) => {
  const query = tsQuery(analysis);
  return query === undefined
    ? none
    : candidates(sql`SELECT ${COLUMNS} ${SOURCE}
        WHERE ${where} AND c.search @@ ${query}
        ORDER BY ts_rank_cd(c.search, ${query}) DESC LIMIT ${LANE_LIMIT}`);
};

const likePattern = (value: string): string =>
  `%${normalizeForMatch(value).replace(/[\\%_]/gu, "\\$&")}%`;

/** Chunks containing the quoted phrases or identifiers, most matches first. */
export const exactLane = (where: SQL, analysis: QueryAnalysis) => {
  const matches = [...analysis.phrases, ...analysis.identifiers].map(
    (value) => sql`(c.content_norm LIKE ${likePattern(value)} ESCAPE '\\')`,
  );
  if (matches.length === 0) return none;
  const matched = sql.join(
    matches.map((match) => sql`(${match})::int`),
    sql` + `,
  );
  return candidates(sql`SELECT ${COLUMNS} ${SOURCE}
    WHERE ${where} AND (${sql.join(matches, sql` OR `)})
    ORDER BY ${matched} DESC, i.updated_at DESC LIMIT ${LANE_LIMIT}`);
};

/** Chunks on the referenced pages, or nearest to the referenced times. */
export const locationLane = (where: SQL, analysis: QueryAnalysis) => {
  const { pages, seconds } = analysis.location;
  if (pages.length === 0 && seconds.length === 0) return none;
  const start = sql`(c.location->>'startSec')::float`;
  const end = sql`coalesce((c.location->>'endSec')::float, ${start})`;
  const onPage = pages.length ? sql`(c.location->>'page')::int IN (${list(pages)})` : sql`false`;
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
    : sql`0`;
  return candidates(sql`SELECT ${COLUMNS} ${SOURCE}
    WHERE ${where} AND (${onPage} OR ${nearTime})
    ORDER BY ${distance}, c.ordinal LIMIT ${LANE_LIMIT}`);
};

/** Candidate rows for chunk ids from the graph lane, filtered and in the given order. */
export const hydrate = (where: SQL, ids: ReadonlyArray<ChunkId>) =>
  ids.length === 0
    ? none
    : candidates(sql`SELECT ${COLUMNS} ${SOURCE} WHERE ${where} AND c.id IN (${list(ids)})`).pipe(
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

/** The content of the given (file, ordinal) chunks, in one query. */
export const neighbours = (
  where: SQL,
  wanted: ReadonlyArray<{ readonly fileId: string; readonly ordinal: number }>,
) =>
  wanted.length === 0
    ? Effect.succeed<ReadonlyArray<typeof NeighbourRow.Type>>([])
    : Effect.flatMap(Effect.service(Database), (database) =>
        database.use((db) =>
          db.execute(sql`SELECT c.file_id AS "fileId", c.ordinal, c.content FROM chunk c
            JOIN file i ON i.id = c.file_id AND i.user_id = c.user_id
            WHERE ${where} AND (c.file_id, c.ordinal) IN (${sql.join(
              wanted.map(({ fileId, ordinal }) => sql`(${fileId}, ${ordinal})`),
              sql`, `,
            )})`),
        ),
      ).pipe(Effect.flatMap(decodeNeighbours));
