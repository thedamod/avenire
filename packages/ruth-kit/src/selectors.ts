import {
  ClusterId,
  FileSelector,
  ItemEventKind,
  ItemId,
  ItemKind,
  ItemSource,
  type SearchHit,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { sql, type SQL } from "drizzle-orm";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type AgentContext, RuthToolError } from "./core.ts";
import { FileEntry } from "./specs.ts";

export const SELECTOR_CANDIDATE_CAP = 2000;
const RETRIEVAL_ID_BATCH = 500;
export interface TimeWindow {
  readonly since?: string;
  readonly until?: string;
}

/** Calendar today starts in the user's zone; lastDays is an elapsed number of 24-hour days. */
export const timeWindow = (
  time: FileSelector["time"],
  timeZone: string,
  now: DateTime.Utc,
): TimeWindow => {
  const lower: number[] = [];
  const upper: number[] = [];
  if (time?.today) {
    const zoned = DateTime.makeZoned(now, { timeZone });
    if (Option.isSome(zoned))
      lower.push(DateTime.toEpochMillis(DateTime.startOf(zoned.value, "day")));
    upper.push(DateTime.toEpochMillis(now));
  }
  if (time?.lastDays !== undefined)
    lower.push(DateTime.toEpochMillis(now) - time.lastDays * 86_400_000);
  for (const [bound, list] of [
    [time?.since, lower],
    [time?.until, upper],
  ] as const) {
    if (bound !== undefined) {
      const parsed = DateTime.make(bound);
      if (Option.isSome(parsed)) list.push(DateTime.toEpochMillis(parsed.value));
    }
  }
  return {
    ...(lower.length === 0
      ? {}
      : { since: DateTime.formatIso(DateTime.makeUnsafe(Math.max(...lower))) }),
    ...(upper.length === 0
      ? {}
      : { until: DateTime.formatIso(DateTime.makeUnsafe(Math.min(...upper))) }),
  };
};

const array = (values: ReadonlyArray<string>) =>
  sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
const bounds = (column: SQL, window: TimeWindow) => [
  ...(window.since === undefined ? [] : [sql`${column} >= ${window.since}::timestamptz`]),
  ...(window.until === undefined ? [] : [sql`${column} <= ${window.until}::timestamptz`]),
];
const conjunction = (clauses: ReadonlyArray<SQL>) =>
  clauses.length === 0 ? sql`TRUE` : sql.join([...clauses], sql` AND `);
const membership = (ids: ReadonlyArray<string>) => sql`EXISTS (
  SELECT 1 FROM item_cluster ic JOIN cluster c ON c.id = ic.cluster_id AND c.user_id = i.user_id
  WHERE ic.item_id = i.id AND ic.user_id = i.user_id AND ic.cluster_id = ANY(${array(ids)})
)`;

/** All identifiers remain parameters, and related rows are scoped before they can match. */
export const metadataFilter = (userId: UserId, selector: FileSelector, window: TimeWindow): SQL => {
  const clauses = [
    sql`i.user_id = ${userId}`,
    sql`i.placement <> 'archived'`,
    sql`i.archived_at IS NULL`,
  ];
  const filters = selector.filters;
  if (filters?.kinds !== undefined) clauses.push(sql`i.kind = ANY(${array(filters.kinds)})`);
  if (filters?.tags !== undefined) clauses.push(sql`i.tags && ${array(filters.tags)}`);
  if (filters?.sources !== undefined) clauses.push(sql`i.source = ANY(${array(filters.sources)})`);
  if (filters?.clusterIds !== undefined) clauses.push(membership(filters.clusterIds));
  const explicit = selector.explicit;
  if (explicit?.itemIds !== undefined) clauses.push(sql`i.id = ANY(${array(explicit.itemIds)})`);
  if (explicit?.clusterIds !== undefined) clauses.push(membership(explicit.clusterIds));
  if (explicit?.captureIds !== undefined)
    clauses.push(
      sql`EXISTS (SELECT 1 FROM capture cap WHERE cap.id = i.capture_id AND cap.user_id = i.user_id AND cap.id = ANY(${array(explicit.captureIds)}))`,
    );
  const eventClauses = [
    sql`e.item_id = i.id`,
    sql`e.user_id = i.user_id`,
    ...bounds(sql`e.at`, window),
  ];
  if (selector.time?.events !== undefined)
    eventClauses.push(sql`e.kind = ANY(${array(selector.time.events)})`);
  const eventMatch = sql`EXISTS (SELECT 1 FROM item_event e WHERE ${conjunction(eventClauses)})`;
  if (selector.time?.events !== undefined) clauses.push(eventMatch);
  else if (window.since !== undefined || window.until !== undefined)
    clauses.push(
      sql`((${conjunction(bounds(sql`coalesce(i.content_modified_at, i.created_at)`, window))}) OR ${eventMatch})`,
    );
  return conjunction(clauses);
};

export interface CandidateOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly folder?: ClusterId | "inbox";
  readonly order?: "activity" | "id";
}
/** One extra row detects truncation; only the first 2,000 become retrieval candidates. */
export const metadataCandidatesStatement = (
  userId: UserId,
  selector: FileSelector,
  window: TimeWindow,
  options: CandidateOptions = {},
): SQL => {
  const extra: SQL[] = [metadataFilter(userId, selector, window)];
  if (options.cursor !== undefined) extra.push(sql`i.id < ${options.cursor}`);
  if (options.folder === "inbox")
    extra.push(
      sql`NOT EXISTS (SELECT 1 FROM item_cluster ic WHERE ic.item_id = i.id AND ic.user_id = i.user_id)`,
    );
  else if (options.folder !== undefined) extra.push(membership([options.folder]));
  const eventClauses = [
    sql`e.user_id = i.user_id`,
    sql`e.item_id = i.id`,
    ...bounds(sql`e.at`, window),
  ];
  if (selector.time?.events !== undefined)
    eventClauses.push(sql`e.kind = ANY(${array(selector.time.events)})`);
  const preferred =
    options.folder !== undefined && options.folder !== "inbox"
      ? sql`(c.id = ${options.folder}) DESC, `
      : sql``;
  const order =
    options.order === "id" ? sql`i.id DESC` : sql`activity."activityAt" DESC, i.id DESC`;
  return sql`
    SELECT i.id AS "fileId", i.title, i.kind, i.mime_type AS "mimeType", i.size_bytes::double precision AS size,
      i.source, i.tags, i.created_at::text AS "createdAt", i.content_modified_at::text AS "contentModifiedAt",
      folder.name AS "folderName", activity."activityAt"::text AS "activityAt", events.entries AS events
    FROM item i
    LEFT JOIN LATERAL (
      SELECT c.name FROM item_cluster ic JOIN cluster c ON c.id = ic.cluster_id AND c.user_id = i.user_id
      WHERE ic.item_id = i.id AND ic.user_id = i.user_id ORDER BY ${preferred}c.name, c.id LIMIT 1
    ) folder ON TRUE
    LEFT JOIN LATERAL (
      SELECT greatest(coalesce(i.content_modified_at, i.created_at), coalesce(max(e.at), i.created_at)) AS "activityAt"
      FROM item_event e WHERE e.item_id = i.id AND e.user_id = i.user_id
    ) activity ON TRUE
    LEFT JOIN LATERAL (
      SELECT coalesce(jsonb_agg(jsonb_build_object('kind', latest.kind, 'at', latest.at::text) ORDER BY latest.at DESC), '[]'::jsonb) AS entries
      FROM (SELECT e.kind, max(e.at) AS at FROM item_event e WHERE ${conjunction(eventClauses)} GROUP BY e.kind) latest
    ) events ON TRUE
    WHERE ${conjunction(extra)} ORDER BY ${order} LIMIT ${options.limit ?? SELECTOR_CANDIDATE_CAP + 1}`;
};

export const MetadataCandidate = Schema.Struct({
  fileId: ItemId,
  title: Schema.String,
  kind: ItemKind,
  mimeType: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.Number),
  source: ItemSource,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  contentModifiedAt: Schema.NullOr(Schema.String),
  folderName: Schema.NullOr(Schema.String),
  activityAt: Schema.String,
  events: Schema.Array(Schema.Struct({ kind: ItemEventKind, at: Schema.String })),
});
export type MetadataCandidate = typeof MetadataCandidate.Type;
const mimeExtensions: Readonly<Record<string, string>> = {
  "text/markdown": "md",
  "text/plain": "txt",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
};
const kindExtensions: Readonly<Record<string, string>> = {
  note: "md",
  pdf: "pdf",
  image: "png",
  audio: "mp3",
  video: "mp4",
  "web-page": "html",
  document: "txt",
  selection: "txt",
};
const pathComponent = (value: string) => value.replace(/[\\/\0]/g, "_") || "Untitled";
const iso = (value: string) =>
  Option.match(DateTime.make(value), { onNone: () => value, onSome: DateTime.formatIso });
export const toFileEntry = (candidate: MetadataCandidate): FileEntry => {
  let filename = pathComponent(candidate.title);
  const extension =
    mimeExtensions[candidate.mimeType?.split(";")[0] ?? ""] ?? kindExtensions[candidate.kind];
  if (!/\.[a-z0-9]{1,10}$/i.test(filename) && extension !== undefined) filename += `.${extension}`;
  return {
    fileId: candidate.fileId,
    title: candidate.title,
    kind: candidate.kind,
    drivePath: `${pathComponent(candidate.folderName ?? "Inbox")}/${filename}`,
    size: candidate.size,
    source: candidate.source,
    tags: candidate.tags,
    createdAt: iso(candidate.createdAt),
    contentModifiedAt:
      candidate.contentModifiedAt === null ? null : iso(candidate.contentModifiedAt),
  };
};

/** Null relevance falls back to fused order, never the uncalibrated fused score. */
export const scoreTopicHits = (hits: ReadonlyArray<SearchHit>): ReadonlyMap<ItemId, number> => {
  const scores = new Map<ItemId, number>();
  hits.forEach((hit, index) => {
    const score = hit.relevance ?? 1 / (index + 1);
    scores.set(hit.itemId, Math.max(scores.get(hit.itemId) ?? 0, score));
  });
  return scores;
};
export const selectorReason = (
  candidate: MetadataCandidate,
  selector: FileSelector,
  timeZone: string,
  now: DateTime.Utc,
  score?: number,
): string => {
  const today = DateTime.makeZoned(now, { timeZone });
  const day = Option.isSome(today)
    ? DateTime.formatIsoDate(today.value)
    : DateTime.formatIsoDateUtc(now);
  const parts = candidate.events.map((event) => {
    const at = DateTime.makeZoned(event.at, { timeZone });
    const date = Option.isSome(at) ? DateTime.formatIsoDate(at.value) : event.at.slice(0, 10);
    return `${event.kind} ${date === day ? "today" : date}`;
  });
  if (parts.length === 0)
    parts.push(
      `${candidate.contentModifiedAt === null ? "created" : "edited"} ${iso(candidate.contentModifiedAt ?? candidate.createdAt).slice(0, 10)}`,
    );
  if (selector.topic && score !== undefined)
    parts.push(`matches "${selector.topic.query}" (${score.toFixed(2)})`);
  parts.push(`in ${candidate.folderName ?? "Inbox"}`);
  return parts.join(" · ");
};

export interface ResolvedFile extends FileEntry {
  readonly reason: string;
  readonly score: number;
}
/** Metadata narrows the library before retrieval; an abstention must never hydrate unrelated files. */
export const resolveSelector = Effect.fn("Selectors.resolveSelector")(function* (
  ctx: AgentContext,
  selector: FileSelector,
  options: { readonly limit: number; readonly now: DateTime.Utc },
) {
  if (
    Option.isNone(DateTime.makeZoned(options.now, { timeZone: ctx.timeZone })) ||
    [selector.time?.since, selector.time?.until].some(
      (value) => value !== undefined && Option.isNone(DateTime.make(value)),
    )
  ) {
    return yield* new RuthToolError({
      tool: "find_files",
      code: "invalid_input",
      message: "Use valid ISO time bounds and an IANA time zone.",
      recoverable: true,
    });
  }
  const window = timeWindow(selector.time, ctx.timeZone, options.now);
  if (window.since !== undefined && window.until !== undefined && window.since > window.until)
    return { files: [] as ResolvedFile[], truncated: false };
  const database = yield* Database;
  const rows = yield* database.use((db) =>
    db.execute(metadataCandidatesStatement(ctx.userId, selector, window)),
  );
  const candidates = yield* Schema.decodeUnknownEffect(Schema.Array(MetadataCandidate))(rows);
  const capped = candidates.slice(0, SELECTOR_CANDIDATE_CAP);
  let scores: ReadonlyMap<ItemId, number> | undefined;
  if (selector.topic && capped.length > 0) {
    const retrieval = yield* Retrieval;
    const topicScores = new Map<ItemId, number>();
    for (let offset = 0; offset < capped.length; offset += RETRIEVAL_ID_BATCH) {
      const result = yield* retrieval.search(ctx.userId, {
        text: selector.topic.query,
        itemIds: capped.slice(offset, offset + RETRIEVAL_ID_BATCH).map((c) => c.fileId),
        limit: 50,
        depth: "standard",
      });
      if (!result.abstained) {
        for (const [id, score] of scoreTopicHits(result.hits))
          topicScores.set(id, Math.max(topicScores.get(id) ?? 0, score));
      }
    }
    if (topicScores.size === 0) return { files: [] as ResolvedFile[], truncated: false };
    scores = topicScores;
  }
  let matched = capped.filter(
    (c) =>
      scores === undefined ||
      (scores.has(c.fileId) && scores.get(c.fileId)! >= (selector.topic?.minRelevance ?? 0)),
  );
  if (scores)
    matched = matched.sort(
      (a, b) => scores.get(b.fileId)! - scores.get(a.fileId)! || a.fileId.localeCompare(b.fileId),
    );
  const limit = Math.min(200, Math.max(1, options.limit));
  return {
    files: matched.slice(0, limit).map((candidate): ResolvedFile => ({
      ...toFileEntry(candidate),
      reason: selectorReason(
        candidate,
        selector,
        ctx.timeZone,
        options.now,
        scores?.get(candidate.fileId),
      ),
      score: scores?.get(candidate.fileId) ?? 0,
    })),
    truncated: candidates.length > SELECTOR_CANDIDATE_CAP || matched.length > limit,
  };
});
