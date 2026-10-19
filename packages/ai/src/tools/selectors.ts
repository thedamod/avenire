import {
  FolderId,
  FileSelector,
  FileEventKind,
  FileId,
  FileKind,
  FileSource,
  type SearchHit,
  type UserId,
} from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { capture, file, fileEvent, fileFolder, folder } from "@avenire/database/schema";
import { Retrieval } from "@avenire/ingestion/retrieval";
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  lt,
  max,
  ne,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
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

const textArray = (values: ReadonlyArray<string>) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
const bounds = (column: SQL, window: TimeWindow) => [
  ...(window.since === undefined ? [] : [gte(column, new Date(window.since))]),
  ...(window.until === undefined ? [] : [lte(column, new Date(window.until))]),
];
const contentDate = sql<Date>`coalesce(${file.contentModifiedAt}, ${file.createdAt})`;
const membership = (db: DatabaseClient, ids: ReadonlyArray<string>) =>
  exists(
    db
      .select({ fileId: fileFolder.fileId })
      .from(fileFolder)
      .innerJoin(folder, and(eq(folder.id, fileFolder.folderId), eq(folder.userId, file.userId)))
      .where(
        and(
          eq(fileFolder.fileId, file.id),
          eq(fileFolder.userId, file.userId),
          inArray(fileFolder.folderId, ids),
        ),
      ),
  );
const eventMatch = (db: DatabaseClient, selector: FileSelector, window: TimeWindow) =>
  exists(
    db
      .select({ id: fileEvent.id })
      .from(fileEvent)
      .where(
        and(
          eq(fileEvent.fileId, file.id),
          eq(fileEvent.userId, file.userId),
          ...bounds(sql<Date>`${fileEvent.at}`, window),
          ...(selector.time?.events === undefined
            ? []
            : [inArray(fileEvent.kind, selector.time.events)]),
        ),
      ),
  );

/** All related rows are scoped to the owner of the outer file. */
export const metadataFilter = (
  db: DatabaseClient,
  userId: UserId,
  selector: FileSelector,
  window: TimeWindow,
): SQL => {
  const clauses: SQL[] = [
    eq(file.userId, userId),
    ne(file.placement, "archived"),
    isNull(file.archivedAt),
  ];
  const filters = selector.filters;
  if (filters?.kinds !== undefined) clauses.push(inArray(file.kind, filters.kinds));
  if (filters?.tags !== undefined) clauses.push(sql`${file.tags} && ${textArray(filters.tags)}`);
  if (filters?.sources !== undefined) clauses.push(inArray(file.source, filters.sources));
  if (filters?.folderIds !== undefined) clauses.push(membership(db, filters.folderIds));
  const explicit = selector.explicit;
  if (explicit?.fileIds !== undefined) clauses.push(inArray(file.id, explicit.fileIds));
  if (explicit?.folderIds !== undefined) clauses.push(membership(db, explicit.folderIds));
  if (explicit?.captureIds !== undefined)
    clauses.push(
      exists(
        db
          .select({ id: capture.id })
          .from(capture)
          .where(
            and(
              eq(capture.id, file.captureId),
              eq(capture.userId, file.userId),
              inArray(capture.id, explicit.captureIds),
            ),
          ),
      ),
    );
  const matchedEvent = eventMatch(db, selector, window);
  if (selector.time?.events !== undefined) clauses.push(matchedEvent);
  else if (window.since !== undefined || window.until !== undefined)
    clauses.push(or(and(...bounds(contentDate, window)), matchedEvent)!);
  return and(...clauses)!;
};

export interface CandidateOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly folderId?: FolderId | "inbox";
  readonly order?: "activity" | "id";
}
/** One extra row detects truncation; only the first 2,000 become retrieval candidates. */
export const metadataCandidatesStatement = (
  db: DatabaseClient,
  userId: UserId,
  selector: FileSelector,
  window: TimeWindow,
  options: CandidateOptions = {},
) => {
  const extra: SQL[] = [metadataFilter(db, userId, selector, window)];
  if (options.cursor !== undefined) extra.push(lt(file.id, options.cursor));
  if (options.folderId === "inbox")
    extra.push(
      not(
        exists(
          db
            .select({ fileId: fileFolder.fileId })
            .from(fileFolder)
            .where(and(eq(fileFolder.fileId, file.id), eq(fileFolder.userId, file.userId))),
        ),
      ),
    );
  else if (options.folderId !== undefined) extra.push(membership(db, [options.folderId]));

  const preferred =
    options.folderId !== undefined && options.folderId !== "inbox"
      ? [desc(sql`${folder.id} = ${options.folderId}`)]
      : [];
  const chosenFolder = db
    .select({ name: folder.name })
    .from(fileFolder)
    .innerJoin(folder, and(eq(folder.id, fileFolder.folderId), eq(folder.userId, file.userId)))
    .where(and(eq(fileFolder.fileId, file.id), eq(fileFolder.userId, file.userId)))
    .orderBy(...preferred, folder.name, folder.id)
    .limit(1)
    .as("chosen_folder");
  const activity = db
    .select({
      activityAt:
        sql<Date>`greatest(${contentDate}, coalesce(max(${fileEvent.at}), ${file.createdAt}))`.as(
          "activity_at",
        ),
    })
    .from(fileEvent)
    .where(and(eq(fileEvent.fileId, file.id), eq(fileEvent.userId, file.userId)))
    .as("activity");
  const latest = db
    .select({ kind: fileEvent.kind, at: max(fileEvent.at).as("at") })
    .from(fileEvent)
    .where(
      and(
        eq(fileEvent.userId, file.userId),
        eq(fileEvent.fileId, file.id),
        ...bounds(sql<Date>`${fileEvent.at}`, window),
        ...(selector.time?.events === undefined
          ? []
          : [inArray(fileEvent.kind, selector.time.events)]),
      ),
    )
    .groupBy(fileEvent.kind)
    .as("latest");
  const events = db
    .select({
      entries: sql<
        ReadonlyArray<{ kind: string; at: string }>
      >`coalesce(jsonb_agg(jsonb_build_object('kind', ${latest.kind}, 'at', ${latest.at}::text) order by ${latest.at} desc), '[]'::jsonb)`.as(
        "entries",
      ),
    })
    .from(latest)
    .as("events");
  const base = db
    .select({
      fileId: file.id,
      title: file.title,
      kind: file.kind,
      mimeType: file.mimeType,
      size: sql<number | null>`${file.sizeBytes}::double precision`,
      source: file.source,
      tags: file.tags,
      createdAt: sql<string>`${file.createdAt}::text`,
      contentModifiedAt: sql<string | null>`${file.contentModifiedAt}::text`,
      folderName: chosenFolder.name,
      activityAt: sql<string>`${activity.activityAt}::text`,
      events: events.entries,
    })
    .from(file)
    .leftJoinLateral(chosenFolder, sql`true`)
    .leftJoinLateral(activity, sql`true`)
    .leftJoinLateral(events, sql`true`)
    .where(and(...extra));
  return options.order === "id"
    ? base.orderBy(desc(file.id)).limit(options.limit ?? SELECTOR_CANDIDATE_CAP + 1)
    : base
        .orderBy(desc(activity.activityAt), desc(file.id))
        .limit(options.limit ?? SELECTOR_CANDIDATE_CAP + 1);
};

export const MetadataCandidate = Schema.Struct({
  fileId: FileId,
  title: Schema.String,
  kind: FileKind,
  mimeType: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.Number),
  source: FileSource,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  contentModifiedAt: Schema.NullOr(Schema.String),
  folderName: Schema.NullOr(Schema.String),
  activityAt: Schema.String,
  events: Schema.Array(Schema.Struct({ kind: FileEventKind, at: Schema.String })),
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
export const scoreTopicHits = (hits: ReadonlyArray<SearchHit>): ReadonlyMap<FileId, number> => {
  const scores = new Map<FileId, number>();
  hits.forEach((hit, index) => {
    const score = hit.relevance ?? 1 / (index + 1);
    scores.set(hit.fileId, Math.max(scores.get(hit.fileId) ?? 0, score));
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
    metadataCandidatesStatement(db, ctx.userId, selector, window),
  );
  const candidates = yield* Schema.decodeUnknownEffect(Schema.Array(MetadataCandidate))(rows);
  const capped = candidates.slice(0, SELECTOR_CANDIDATE_CAP);
  let scores: ReadonlyMap<FileId, number> | undefined;
  if (selector.topic && capped.length > 0) {
    const retrieval = yield* Retrieval;
    const topicScores = new Map<FileId, number>();
    for (let offset = 0; offset < capped.length; offset += RETRIEVAL_ID_BATCH) {
      const result = yield* retrieval.search(ctx.userId, {
        text: selector.topic.query,
        fileIds: capped.slice(offset, offset + RETRIEVAL_ID_BATCH).map((c) => c.fileId),
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
