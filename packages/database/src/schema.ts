import type {
  ArtifactKind,
  ChunkKind,
  CloudRunStatus,
  CaptureSnapshot,
  CanvasNodeRef,
  ChunkLocation,
  ExtractionCoverage,
  ItemKind,
  IngestionStatus,
  ItemPlacement,
  SearchResult,
} from "@avenire/contracts";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
});

export const session = pgTable("session", {
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
});

export const account = pgTable("account", {
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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
  createdAt: timestamptz("created_at"),
  updatedAt: timestamptz("updated_at"),
});

export const capture = pgTable("capture", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  deviceId: text("device_id").notNull(),
  capturedAt: timestamptz("captured_at").notNull(),
  snapshot: jsonb("snapshot").$type<CaptureSnapshot>().notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const item = pgTable(
  "item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ItemKind>().notNull(),
    title: text("title").notNull(),
    placement: text("placement").$type<ItemPlacement>().notNull().default("inbox"),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    captureId: text("capture_id").references(() => capture.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    mediaPositionSec: real("media_position_sec"),
    contentHash: text("content_hash"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("item_user_dedupe_key_unique").on(t.userId, t.dedupeKey),
    index("item_user_placement_idx").on(t.userId, t.placement),
  ],
);

export const cluster = pgTable("cluster", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  suggested: boolean("suggested").notNull().default(false),
  centroid: vector("centroid", { dimensions: 1536 }),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const itemCluster = pgTable(
  "item_cluster",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => cluster.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.clusterId] })],
);

export const canvasNode = pgTable("canvas_node", {
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
});

export const ingestionJob = pgTable(
  "ingestion_job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .unique()
      .references(() => item.id, { onDelete: "cascade" }),
    status: text("status").$type<IngestionStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    coverage: jsonb("coverage").$type<ExtractionCoverage>(),
    lockedUntil: timestamptz("locked_until"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ingestion_job_status_locked_until_idx").on(t.status, t.lockedUntil)],
);

export const chunk = pgTable(
  "chunk",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
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
    /** Weighted at write time: item title A, heading B, content D. */
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
    index("chunk_item_id_idx").on(t.itemId, t.ordinal),
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
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.chunkId] }),
    index("entity_mention_chunk_id_idx").on(t.chunkId),
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
    itemId: text("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("entity_relation_source_idx").on(t.userId, t.sourceId),
    index("entity_relation_target_idx").on(t.userId, t.targetId),
    index("entity_relation_chunk_id_idx").on(t.chunkId),
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
    index("search_cache_lookup_idx").on(t.userId, t.optionsKey, t.queryText),
    index("search_cache_expires_at_idx").on(t.expiresAt),
  ],
);

export const ruthThread = pgTable("ruth_thread", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** Full access: Ruth applies file actions without asking for approval. */
  fullAccess: boolean("full_access").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

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
  (t) => [index("ruth_message_thread_created_idx").on(t.threadId, t.createdAt)],
);

export const cloudSchedule = pgTable("cloud_schedule", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  runAt: text("run_at").notNull().default("03:00"),
  timeZone: text("time_zone").notNull().default("UTC"),
  artifactKinds: jsonb("artifact_kinds").$type<ReadonlyArray<ArtifactKind>>().notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const cloudRun = pgTable(
  "cloud_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<CloudRunStatus>().notNull(),
    windowStart: timestamptz("window_start").notNull(),
    windowEnd: timestamptz("window_end").notNull(),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
    error: text("error"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("cloud_run_user_window_start_unique").on(t.userId, t.windowStart)],
);

export const artifact = pgTable(
  "artifact",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cloudRunId: text("cloud_run_id").references(() => cloudRun.id, { onDelete: "set null" }),
    threadId: text("thread_id").references(() => ruthThread.id, { onDelete: "set null" }),
    kind: text("kind").$type<ArtifactKind>().notNull(),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceItemIds: jsonb("source_item_ids").$type<ReadonlyArray<string>>().notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("artifact_user_created_idx").on(t.userId, t.createdAt)],
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
  (t) => [index("email_outbox_status_send_after_idx").on(t.status, t.sendAfter)],
);

export const itemRelations = relations(item, ({ many }) => ({
  chunks: many(chunk),
  clusters: many(itemCluster),
}));
export const chunkRelations = relations(chunk, ({ one }) => ({
  item: one(item, { fields: [chunk.itemId], references: [item.id] }),
}));
export const entityRelations = relations(entity, ({ many }) => ({
  mentions: many(entityMention),
}));
export const entityMentionRelations = relations(entityMention, ({ one }) => ({
  entity: one(entity, { fields: [entityMention.entityId], references: [entity.id] }),
  chunk: one(chunk, { fields: [entityMention.chunkId], references: [chunk.id] }),
}));
export const clusterRelations = relations(cluster, ({ many }) => ({ items: many(itemCluster) }));
export const itemClusterRelations = relations(itemCluster, ({ one }) => ({
  item: one(item, { fields: [itemCluster.itemId], references: [item.id] }),
  cluster: one(cluster, { fields: [itemCluster.clusterId], references: [cluster.id] }),
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
  item,
  cluster,
  itemCluster,
  canvasNode,
  ingestionJob,
  chunk,
  embeddingCache,
  entity,
  entityMention,
  entityRelation,
  searchCache,
  ruthThread,
  ruthMessage,
  cloudSchedule,
  cloudRun,
  artifact,
  emailOutbox,
  itemRelations,
  chunkRelations,
  entityRelations,
  entityMentionRelations,
  clusterRelations,
  itemClusterRelations,
  ruthThreadRelations,
  ruthMessageRelations,
};

export type UserRow = typeof user.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type AccountRow = typeof account.$inferSelect;
export type VerificationRow = typeof verification.$inferSelect;
export type CaptureRow = typeof capture.$inferSelect;
export type ItemRow = typeof item.$inferSelect;
export type ClusterRow = typeof cluster.$inferSelect;
export type ItemClusterRow = typeof itemCluster.$inferSelect;
export type CanvasNodeRow = typeof canvasNode.$inferSelect;
export type IngestionJobRow = typeof ingestionJob.$inferSelect;
export type ChunkRow = typeof chunk.$inferSelect;
export type EntityRow = typeof entity.$inferSelect;
export type EntityRelationRow = typeof entityRelation.$inferSelect;
export type RuthThreadRow = typeof ruthThread.$inferSelect;
export type RuthMessageRow = typeof ruthMessage.$inferSelect;
export type CloudScheduleRow = typeof cloudSchedule.$inferSelect;
export type CloudRunRow = typeof cloudRun.$inferSelect;
export type ArtifactRow = typeof artifact.$inferSelect;
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
