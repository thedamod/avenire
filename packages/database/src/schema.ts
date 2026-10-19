import type {
  CanvasNodeRef,
  AssetKind,
  AssetVisibility,
  ChunkKind,
  CloudRunStatus,
  CaptureSnapshot,
  ChunkLocation,
  ExtractionCoverage,
  FileKind,
  FileSource,
  FileEventKind,
  RuthThreadKind,
  CloudTaskSchedule,
  CloudTaskDelivery,
  HydrationRule,
  FileSelector,
  HydratedFile,
  PendingApprovalStatus,
  IngestionStatus,
  FilePlacement,
  SearchResult,
} from "@avenire/contracts";
import {
  bigint,
  boolean,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  cloudInputsSlug: text("cloud_inputs_slug"),
  /** Advances atomically with every change to the searchable library. */
  corpusRevision: integer("corpus_revision").notNull().default(0),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at"),
    updatedAt: timestamptz("updated_at"),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const capture = pgTable(
  "capture",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    capturedAt: timestamptz("captured_at").notNull(),
    snapshot: jsonb("snapshot").$type<CaptureSnapshot>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("capture_user_captured_at_idx").on(t.userId, t.capturedAt)],
);

export const file = pgTable(
  "file",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FileKind>().notNull(),
    title: text("title").notNull(),
    placement: text("placement").$type<FilePlacement>().notNull().default("inbox"),
    source: text("source").$type<FileSource>().notNull().default("upload"),
    contentModifiedAt: timestamptz("content_modified_at"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    archivedAt: timestamptz("archived_at"),
    /** Once claimed, storage deletion is irreversible; restore must reject the claim. */
    purgeStartedAt: timestamptz("purge_started_at"),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    captureId: text("capture_id").references(() => capture.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    mediaPositionSec: real("media_position_sec"),
    /** SHA-256 of the stored source bytes the current index was built from. */
    contentHash: text("content_hash"),
    /** The extracted document for `contentHash`, and the extractor version that produced it. */
    documentKey: text("document_key"),
    extractorVersion: integer("extractor_version"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("file_user_dedupe_key_unique").on(t.userId, t.dedupeKey),
    unique("file_id_user_unique").on(t.id, t.userId),
    index("file_user_placement_idx").on(t.userId, t.placement),
    index("file_user_content_modified_idx").on(t.userId, t.contentModifiedAt),
    index("file_capture_id_idx").on(t.captureId),
    index("file_placement_archived_at_idx").on(t.placement, t.archivedAt),
  ],
);

/** Library activity used by time-based selectors. */
export const fileEvent = pgTable(
  "file_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FileEventKind>().notNull(),
    at: timestamptz("at").notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (t) => [
    index("file_event_user_at_idx").on(t.userId, t.at),
    index("file_event_user_file_at_idx").on(t.userId, t.fileId, t.at),
    index("file_event_file_id_idx").on(t.fileId),
  ],
);

/** Short-lived, owner-scoped staging for originals acquired on the user's device. */
export const sourceUpload = pgTable(
  "source_upload",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    fileId: text("file_id").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<FileKind>().notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    /** Citation provenance only. Never a credential or a fallback download target. */
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    abandonedStorageKeys: text("abandoned_storage_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status")
      .$type<"pending" | "uploading" | "completed" | "cancelled">()
      .notNull()
      .default("pending"),
    expiresAt: timestamptz("expires_at").notNull(),
    claimToken: text("claim_token"),
    claimExpiresAt: timestamptz("claim_expires_at"),
    completedFileId: text("completed_file_id").references(() => file.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("source_upload_user_idempotency_unique").on(t.userId, t.idempotencyKey),
    unique("source_upload_file_id_unique").on(t.fileId),
    unique("source_upload_storage_key_unique").on(t.storageKey),
    index("source_upload_user_status_idx").on(t.userId, t.status),
    index("source_upload_expiry_idx").on(t.expiresAt),
  ],
);

export const folder = pgTable(
  "folder",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    suggested: boolean("suggested").notNull().default(false),
    centroid: vector("centroid", { dimensions: 1536 }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("folder_user_id_idx").on(t.userId)],
);

export const fileFolder = pgTable(
  "file_folder",
  {
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => folder.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.folderId] }),
    index("file_folder_folder_id_idx").on(t.folderId),
    index("file_folder_user_id_idx").on(t.userId),
  ],
);

export const canvasNode = pgTable(
  "canvas_node",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ref: jsonb("ref").$type<CanvasNodeRef>().notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    width: real("width").notNull(),
    height: real("height").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("canvas_node_user_id_idx").on(t.userId)],
);

export const ingestionJob = pgTable(
  "ingestion_job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .unique()
      .references(() => file.id, { onDelete: "cascade" }),
    status: text("status").$type<IngestionStatus>().notNull().default("queued"),
    /** Bumped on every enqueue; a run only writes while its generation is current. */
    generation: integer("generation").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    coverage: jsonb("coverage").$type<ExtractionCoverage>(),
    lockedUntil: timestamptz("locked_until"),
    /** Fresh on every claim/reclaim, independently of source generation. */
    claimToken: text("claim_token"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ingestion_job_status_locked_until_created_at_idx").on(
      t.status,
      t.lockedUntil,
      t.createdAt,
    ),
    index("ingestion_job_user_id_idx").on(t.userId),
  ],
);

export const chunk = pgTable(
  "chunk",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    kind: text("kind").$type<ChunkKind>().notNull(),
    content: text("content").notNull(),
    location: jsonb("location").$type<ChunkLocation>().notNull(),
    tokenCount: integer("token_count").notNull(),
    /** SHA-256 of the text that was embedded (content with its title and location). */
    contentHash: text("content_hash").notNull(),
    /** NFKC-folded, lowercased content for the exact-match lane's trigram index. */
    contentNorm: text("content_norm").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    /** Weighted at write time: file title A, heading B, content D. */
    search: tsvector("search").notNull(),
    embeddingModel: text("embedding_model"),
    /** Set once the chunk's entities and relations are stored; false chunks are retried. */
    graphIndexed: boolean("graph_indexed").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("chunk_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunk_search_gin_idx").using("gin", t.search),
    index("chunk_content_norm_trgm_idx").using("gin", t.contentNorm.op("gin_trgm_ops")),
    index("chunk_file_id_idx").on(t.fileId, t.ordinal),
    index("chunk_user_id_idx").on(t.userId),
  ],
);

/** Vectors by (model, SHA-256 of the embedded text), so unchanged text is never re-embedded. */
export const embeddingCache = pgTable(
  "embedding_cache",
  {
    model: text("model").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.model, t.contentHash] })],
);

/** Whisper segments by model and exact audio clip bytes, reused across retries. */
export const transcriptCache = pgTable(
  "transcript_cache",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: text("file_id").notNull(),
    model: text("model").notNull(),
    contentHash: text("content_hash").notNull(),
    segments: jsonb("segments")
      .$type<
        ReadonlyArray<{ readonly text: string; readonly startSec: number; readonly endSec: number }>
      >()
      .notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.fileId, t.model, t.contentHash] }),
    foreignKey({
      columns: [t.fileId, t.userId],
      foreignColumns: [file.id, file.userId],
      name: "transcript_cache_file_owner_fk",
    }).onDelete("cascade"),
    index("transcript_cache_expires_idx").on(t.expiresAt),
  ],
);

/** A named thing in the user's material (a concept, person, theorem, ...), one row per key. */
export const entity = pgTable(
  "entity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Normalized name; entities with the same key are the same entity. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("entity_user_key_unique").on(t.userId, t.key),
    index("entity_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/** An entity appearing in a chunk. */
export const entityMention = pgTable(
  "entity_mention",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    chunkId: text("chunk_id")
      .notNull()
      .references(() => chunk.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.chunkId] }),
    index("entity_mention_chunk_id_idx").on(t.chunkId),
    index("entity_mention_file_id_idx").on(t.fileId),
    index("entity_mention_user_id_idx").on(t.userId),
  ],
);

/** A directed, typed edge between two entities, stated by one chunk. */
export const entityRelation = pgTable(
  "entity_relation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    targetId: text("target_id")
      .notNull()
      .references(() => entity.id, { onDelete: "cascade" }),
    predicate: text("predicate").notNull(),
    description: text("description").notNull(),
    /** Extraction confidence in (0, 1]. */
    weight: real("weight").notNull(),
    chunkId: text("chunk_id")
      .notNull()
      .references(() => chunk.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("entity_relation_source_idx").on(t.userId, t.sourceId),
    index("entity_relation_target_idx").on(t.userId, t.targetId),
    index("entity_relation_chunk_id_idx").on(t.chunkId),
    index("entity_relation_source_id_idx").on(t.sourceId),
    index("entity_relation_target_id_idx").on(t.targetId),
    index("entity_relation_file_id_idx").on(t.fileId),
  ],
);

/**
 * Search results by query embedding. `options_key` fingerprints everything besides
 * the wording (filters, limit, depth, parsed locations and quoted phrases), so a hit
 * only ever answers an equivalent request. Rows are deleted when the corpus changes.
 */
export const searchCache = pgTable(
  "search_cache",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    corpusRevision: integer("corpus_revision").notNull().default(0),
    optionsKey: text("options_key").notNull(),
    /** Normalized query text, for exact repeats that skip embedding entirely. */
    queryText: text("query_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    result: jsonb("result").$type<SearchResult>().notNull(),
    hits: integer("hits").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
  },
  (t) => [
    index("search_cache_lookup_idx").on(t.userId, t.corpusRevision, t.optionsKey, t.queryText),
    index("search_cache_expires_at_idx").on(t.expiresAt),
  ],
);

export const ruthThread = pgTable(
  "ruth_thread",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RuthThreadKind>().notNull().default("chat"),
    title: text("title").notNull(),
    /** Full access: Ruth applies file actions without asking for approval. */
    fullAccess: boolean("full_access").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ruth_thread_user_cloud_unique")
      .on(t.userId)
      .where(sql`${t.kind} = 'ruth-cloud'`),
    index("ruth_thread_user_updated_at_idx").on(t.userId, t.updatedAt),
  ],
);

/** One AI SDK `UIMessage`; approvals live in its tool parts. */
export const ruthMessage = pgTable(
  "ruth_message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => ruthThread.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"system" | "user" | "assistant">().notNull(),
    parts: jsonb("parts").$type<ReadonlyArray<unknown>>().notNull(),
    metadata: jsonb("metadata").$type<unknown>(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ruth_message_thread_created_idx").on(t.threadId, t.createdAt),
    index("ruth_message_user_id_idx").on(t.userId),
  ],
);

/** Scheduled work in the user's persistent Ruth Cloud workspace. */
export const cloudTask = pgTable(
  "cloud_task",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    model: text("model")
      .$type<"ruth-sprint" | "ruth-core" | "ruth-apex">()
      .notNull()
      .default("ruth-core"),
    network: text("network").$type<"packages" | "open">().notNull().default("packages"),
    schedule: jsonb("schedule").$type<CloudTaskSchedule>().notNull(),
    timeZone: text("time_zone").notNull().default("UTC"),
    preHydration: jsonb("pre_hydration")
      .$type<ReadonlyArray<HydrationRule>>()
      .notNull()
      .default([]),
    delivery: jsonb("delivery").$type<CloudTaskDelivery>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    builtin: text("builtin").$type<"nightly-digest">(),
    /** A hidden task backing one `POST /api/ruth/cloud` run; never listed, scheduled or editable. */
    oneOff: boolean("one_off").notNull().default(false),
    /** Retiring a task preserves runs, outstanding review and cleanup obligations. */
    retiredAt: timestamptz("retired_at"),
    maxAttempts: integer("max_attempts").notNull().default(2),
    nextRunAt: timestamptz("next_run_at"),
    lastRunAt: timestamptz("last_run_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("cloud_task_enabled_next_run_idx").on(t.enabled, t.nextRunAt),
    index("cloud_task_user_updated_at_idx").on(t.userId, t.updatedAt),
    uniqueIndex("cloud_task_user_builtin_unique")
      .on(t.userId, t.builtin)
      .where(sql`${t.builtin} is not null`),
  ],
);

export const cloudRun = pgTable(
  "cloud_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => cloudTask.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folder.id, { onDelete: "set null" }),
    scheduledFor: timestamptz("scheduled_for").notNull(),
    /** When a worker claimed the run; a run active long past this belongs to a dead worker. */
    claimedAt: timestamptz("claimed_at"),
    leasedBy: text("leased_by"),
    leaseExpiresAt: timestamptz("lease_expires_at"),
    heartbeatAt: timestamptz("heartbeat_at"),
    messages: jsonb("messages").$type<import("ai").ModelMessage[]>().notNull().default([]),
    stepIndex: integer("step_index").notNull().default(0),
    usage: jsonb("usage")
      .$type<{
        inputTokens: number;
        outputTokens: number;
        cost: number;
        actions: number;
        /** Box time is metered per attempt up to here (epoch ms), so re-metering never double-counts. */
        meteredUntil?: number;
        cleanupComplete?: boolean;
        resumeFailures?: number;
        execution?: { status: "completed"; text: string };
        reportText?: string;
        lengthContinuations?: number;
      }>()
      .notNull()
      .default({ inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 }),
    recordingId: text("recording_id"),
    modelName: text("model_name"),
    promptVersion: text("prompt_version"),
    inputsSlug: text("inputs_slug"),
    notBefore: timestamptz("not_before").notNull().defaultNow(),
    attempt: integer("attempt").notNull().default(1),
    summary: text("summary"),
    reportMessageId: text("report_message_id"),
    logTail: text("log_tail"),
    status: text("status").$type<CloudRunStatus>().notNull(),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    error: text("error"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("cloud_run_status_not_before_idx").on(t.status, t.notBefore),
    index("cloud_run_user_status_idx").on(t.userId, t.status),
    index("cloud_run_status_scheduled_for_idx").on(t.status, t.scheduledFor),
    index("cloud_run_folder_id_idx").on(t.folderId),
    uniqueIndex("cloud_run_task_scheduled_attempt_unique").on(t.taskId, t.scheduledFor, t.attempt),
  ],
);

/** Tool intents survive an interrupted model step; results are replayed by call id. */
export const cloudToolCall = pgTable(
  "cloud_tool_call",
  {
    runId: text("run_id")
      .notNull()
      .references(() => cloudRun.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<"pending" | "started" | "completed">().notNull(),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    sessionId: text("session_id"),
    commandId: text("command_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [primaryKey({ columns: [t.runId, t.toolCallId] })],
);

/**
 * Durable UI message chunk log for one Cloud run, written in batches by the executor and
 * replayed/tailed by the stream routes. `seq` is dense per run; the terminal row ends the stream.
 */
export const cloudRunEvent = pgTable(
  "cloud_run_event",
  {
    runId: text("run_id")
      .notNull()
      .references(() => cloudRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    chunk: jsonb("chunk").$type<import("ai").UIMessageChunk>().notNull(),
    terminal: boolean("terminal").notNull().default(false),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.seq] }),
    uniqueIndex("cloud_run_event_terminal_unique")
      .on(t.runId)
      .where(sql`${t.terminal}`),
  ],
);

/** Audit manifest for one workspace hydration call. */
export const cloudHydration = pgTable(
  "cloud_hydration",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => cloudRun.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"pre-hydration" | "agent">().notNull(),
    selector: jsonb("selector").$type<FileSelector>().notNull(),
    maxFiles: integer("max_files").notNull(),
    maxBytes: bigint("max_bytes", { mode: "number" }).notNull(),
    files: jsonb("files").$type<ReadonlyArray<HydratedFile>>().notNull(),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull(),
    truncated: jsonb("truncated").$type<{ byCount: boolean; byBytes: boolean }>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("cloud_hydration_run_idx").on(t.runId),
    index("cloud_hydration_user_id_idx").on(t.userId),
  ],
);

/** Cached originals in the persistent workspace, tracked for reuse and eviction. */
export const cloudWorkspaceFile = pgTable(
  "cloud_workspace_file",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    sandboxPath: text("sandbox_path").notNull(),
    contentHash: text("content_hash").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    hydratedAt: timestamptz("hydrated_at").notNull(),
    lastUsedAt: timestamptz("last_used_at").notNull(),
    lastRunId: text("last_run_id"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.fileId] }),
    index("cloud_workspace_file_user_last_used_idx").on(t.userId, t.lastUsedAt),
    index("cloud_workspace_file_file_id_idx").on(t.fileId),
  ],
);

/** Proposed changes to originals; applied only after morning review. */
export const pendingApproval = pgTable(
  "pending_approval",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => cloudRun.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => file.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"sync">().notNull().default("sync"),
    status: text("status").$type<PendingApprovalStatus>().notNull().default("pending"),
    baseHash: text("base_hash").notNull(),
    proposedKey: text("proposed_key").notNull(),
    proposedHash: text("proposed_hash").notNull(),
    proposedSize: bigint("proposed_size", { mode: "number" }).notNull(),
    conflict: text("conflict"),
    summary: text("summary").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    resolvedAt: timestamptz("resolved_at"),
  },
  (t) => [
    index("pending_approval_user_status_idx").on(t.userId, t.status),
    index("pending_approval_run_idx").on(t.runId),
    index("pending_approval_file_id_idx").on(t.fileId),
  ],
);

export const sandboxUsage = pgTable(
  "sandbox_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    chatSeconds: integer("chat_seconds").notNull().default(0),
    cloudSeconds: integer("cloud_seconds").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AssetKind>().notNull(),
    title: text("title").notNull(),
    mediaType: text("media_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentHash: text("content_hash").notNull(),
    threadId: text("thread_id").references(() => ruthThread.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => ruthMessage.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => cloudRun.id, { onDelete: "set null" }),
    visibility: text("visibility").$type<AssetVisibility>().notNull().default("private"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("asset_user_created_idx").on(t.userId, t.createdAt, t.id),
    index("asset_user_thread_created_idx").on(t.userId, t.threadId, t.createdAt),
    index("asset_user_run_created_idx").on(t.userId, t.runId, t.createdAt),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    toAddress: text("to_address").notNull(),
    template: text("template").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<"pending" | "sent" | "failed">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sendAfter: timestamptz("send_after").notNull().defaultNow(),
    sentAt: timestamptz("sent_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_outbox_status_send_after_idx").on(t.status, t.sendAfter),
    index("email_outbox_user_id_idx").on(t.userId),
  ],
);

export const fileRelations = relations(file, ({ many }) => ({
  chunks: many(chunk),
  folders: many(fileFolder),
}));
export const chunkRelations = relations(chunk, ({ one }) => ({
  file: one(file, { fields: [chunk.fileId], references: [file.id] }),
}));
export const entityRelations = relations(entity, ({ many }) => ({
  mentions: many(entityMention),
}));
export const entityMentionRelations = relations(entityMention, ({ one }) => ({
  entity: one(entity, { fields: [entityMention.entityId], references: [entity.id] }),
  chunk: one(chunk, { fields: [entityMention.chunkId], references: [chunk.id] }),
}));
export const folderRelations = relations(folder, ({ many }) => ({ files: many(fileFolder) }));
export const fileFolderRelations = relations(fileFolder, ({ one }) => ({
  file: one(file, { fields: [fileFolder.fileId], references: [file.id] }),
  folder: one(folder, { fields: [fileFolder.folderId], references: [folder.id] }),
}));
export const ruthThreadRelations = relations(ruthThread, ({ many }) => ({
  messages: many(ruthMessage),
}));
export const ruthMessageRelations = relations(ruthMessage, ({ one }) => ({
  thread: one(ruthThread, { fields: [ruthMessage.threadId], references: [ruthThread.id] }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  capture,
  file,
  fileEvent,
  sourceUpload,
  canvasNode,
  folder,
  fileFolder,
  ingestionJob,
  chunk,
  embeddingCache,
  transcriptCache,
  entity,
  entityMention,
  entityRelation,
  searchCache,
  ruthThread,
  ruthMessage,
  cloudRun,
  cloudTask,
  cloudToolCall,
  cloudHydration,
  cloudWorkspaceFile,
  pendingApproval,
  sandboxUsage,
  asset,
  emailOutbox,
  fileRelations,
  chunkRelations,
  entityRelations,
  entityMentionRelations,
  folderRelations,
  fileFolderRelations,
  ruthThreadRelations,
  ruthMessageRelations,
};

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type VerificationRow = typeof verification.$inferSelect;
export type CaptureRow = typeof capture.$inferSelect;
export type FileRow = typeof file.$inferSelect;
export type CanvasNodeRow = typeof canvasNode.$inferSelect;
export type SourceUploadRow = typeof sourceUpload.$inferSelect;
export type FolderRow = typeof folder.$inferSelect;
export type FileFolderRow = typeof fileFolder.$inferSelect;
export type IngestionJobRow = typeof ingestionJob.$inferSelect;
export type ChunkRow = typeof chunk.$inferSelect;
export type EntityRow = typeof entity.$inferSelect;
export type EntityRelationRow = typeof entityRelation.$inferSelect;
export type RuthThreadRow = typeof ruthThread.$inferSelect;
export type RuthMessageRow = typeof ruthMessage.$inferSelect;
export type CloudRunRow = typeof cloudRun.$inferSelect;
export type AssetRow = typeof asset.$inferSelect;
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;

export type FileEventRow = typeof fileEvent.$inferSelect;
export type CloudTaskRow = typeof cloudTask.$inferSelect;
export type CloudToolCallRow = typeof cloudToolCall.$inferSelect;
export type CloudHydrationRow = typeof cloudHydration.$inferSelect;
export type CloudWorkspaceFileRow = typeof cloudWorkspaceFile.$inferSelect;
export type PendingApprovalRow = typeof pendingApproval.$inferSelect;
export type SandboxUsageRow = typeof sandboxUsage.$inferSelect;
