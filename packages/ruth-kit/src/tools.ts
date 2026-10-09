import { ChunkId, ClusterId, ItemId, NotFound } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, cluster, item, itemCluster } from "@avenire/database/schema";
import { archiveItem } from "@avenire/ingestion/archive";
import { recordItemEvent } from "@avenire/ingestion/events";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { Analytics } from "@avenire/shared/observability";
import { itemSourceKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { type AgentContext, RuthToolError, type ToolImpl } from "./core.ts";
import {
  MetadataCandidate,
  metadataCandidatesStatement,
  resolveSelector,
  toFileEntry,
} from "./selectors.ts";
import { RUTH_TOOL_SPECS, type RuthToolName } from "./specs.ts";
import { WidgetStore } from "./widgets.ts";

/** enqueueIngestion requires only Database and Crypto, rather than the worker's runtime layer. */
export type RuthKitServices =
  | Database
  | Storage
  | Retrieval
  | SemanticCache
  | Crypto.Crypto
  | Analytics
  | WidgetStore;
export type RuthToolImplementations = {
  [K in RuthToolName]: ToolImpl<
    (typeof RUTH_TOOL_SPECS)[K]["inputSchema"]["Type"],
    (typeof RUTH_TOOL_SPECS)[K]["outputSchema"]["Type"],
    RuthKitServices
  >;
};
const ownedItem = Effect.fn("RuthKit.ownedItem")(function* (ctx: AgentContext, fileId: ItemId) {
  const database = yield* Database;
  const row = yield* database.use((db) =>
    db.query.item.findFirst({
      columns: { id: true },
      where: and(
        eq(item.id, fileId),
        eq(item.userId, ctx.userId),
        ne(item.placement, "archived"),
        isNull(item.archivedAt),
      ),
    }),
  );
  if (!row) return yield* new NotFound({ entity: "File", id: fileId });
});
const ownedFolder = Effect.fn("RuthKit.ownedFolder")(function* (
  ctx: AgentContext,
  folder: ClusterId,
) {
  const database = yield* Database;
  const row = yield* database.use((db) =>
    db.query.cluster.findFirst({
      columns: { id: true },
      where: and(eq(cluster.id, folder), eq(cluster.userId, ctx.userId)),
    }),
  );
  if (!row) return yield* new NotFound({ entity: "Folder", id: folder });
});
const FolderEntry = Schema.Struct({
  clusterId: ClusterId,
  name: Schema.String,
  itemCount: Schema.Int,
});

export const ruthKitTools: RuthToolImplementations = {
  search_materials: Effect.fn("RuthKit.searchMaterials")(function* (input, ctx) {
    const retrieval = yield* Retrieval;
    const result = yield* retrieval.search(ctx.userId, {
      text: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.depth === undefined ? {} : { depth: input.depth }),
    });
    return {
      hits: result.hits.map((hit) => ({
        chunkId: hit.chunkId,
        itemId: hit.itemId,
        title: hit.itemTitle,
        location: hit.location,
        content: hit.content,
        relevance: hit.relevance,
        ...(hit.context === undefined ? {} : { context: hit.context }),
      })),
      facts: result.facts,
      aspects: result.aspects,
      abstained: result.abstained,
    };
  }),
  list_files: Effect.fn("RuthKit.listFiles")(function* (input, ctx) {
    const database = yield* Database;
    if (input.folder !== undefined && input.folder !== "inbox")
      yield* ownedFolder(ctx, input.folder);
    let cursor: string | undefined;
    if (input.cursor !== undefined) {
      cursor = Buffer.from(input.cursor, "base64url").toString("utf8");
      if (!cursor || Buffer.from(cursor).toString("base64url") !== input.cursor)
        return yield* new RuthToolError({
          tool: "list_files",
          code: "invalid_input",
          message: "The file cursor is invalid. List files again without a cursor.",
          recoverable: true,
        });
    }
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const rows = yield* database.use((db) =>
      db.execute(
        metadataCandidatesStatement(
          ctx.userId,
          input.kinds === undefined ? {} : { filters: { kinds: input.kinds } },
          {},
          {
            limit: limit + 1,
            order: "id",
            ...(cursor === undefined ? {} : { cursor }),
            ...(input.folder === undefined ? {} : { folder: input.folder }),
          },
        ),
      ),
    );
    const candidates = yield* Schema.decodeUnknownEffect(Schema.Array(MetadataCandidate))(rows);
    const selected = candidates.slice(0, limit);
    const folders =
      input.folder !== undefined
        ? []
        : yield* database.use((db) =>
            db.execute(sql`
      SELECT c.id AS "clusterId", c.name, count(i.id)::int AS "itemCount"
      FROM cluster c LEFT JOIN item_cluster ic ON ic.cluster_id = c.id AND ic.user_id = c.user_id
      LEFT JOIN item i ON i.id = ic.item_id AND i.user_id = c.user_id AND i.placement <> 'archived' AND i.archived_at IS NULL
      WHERE c.user_id = ${ctx.userId} GROUP BY c.id, c.name ORDER BY c.name, c.id`),
          );
    return {
      folders: yield* Schema.decodeUnknownEffect(Schema.Array(FolderEntry))(folders),
      files: selected.map(toFileEntry),
      nextCursor:
        candidates.length > limit && selected.length > 0
          ? Buffer.from(selected[selected.length - 1]!.fileId).toString("base64url")
          : null,
    };
  }),
  find_files: Effect.fn("RuthKit.findFiles")(function* (input, ctx) {
    const now = yield* DateTime.now;
    const result = yield* resolveSelector(ctx, input.selector, { limit: input.limit ?? 200, now });
    return {
      files: result.files.map(({ score: _score, ...file }) => file),
      truncated: result.truncated,
    };
  }),
  read_file: Effect.fn("RuthKit.readFile")(function* (input, ctx) {
    yield* ownedItem(ctx, input.fileId);
    const database = yield* Database;
    const rows = yield* database.use((db) =>
      db
        .select({
          chunkId: chunk.id,
          title: item.title,
          location: chunk.location,
          content: chunk.content,
        })
        .from(chunk)
        .innerJoin(item, eq(chunk.itemId, item.id))
        .where(
          and(
            eq(item.id, input.fileId),
            eq(item.userId, ctx.userId),
            ne(item.placement, "archived"),
            isNull(item.archivedAt),
            ...(input.fromOrdinal === undefined
              ? []
              : [gte(chunk.ordinal, Math.max(0, input.fromOrdinal))]),
          ),
        )
        .orderBy(asc(chunk.ordinal))
        .limit(Math.min(Math.max(input.count ?? 12, 1), 40)),
    );
    return rows.map((row) => ({
      ...row,
      chunkId: ChunkId.make(row.chunkId),
      itemId: input.fileId,
    }));
  }),
  write_file: Effect.fn("RuthKit.writeFile")(function* (input, ctx) {
    if (input.folder !== undefined) yield* ownedFolder(ctx, input.folder);
    const storage = yield* Storage;
    const database = yield* Database;
    const fileId = yield* newId(ItemId);
    const storageKey = itemSourceKey(ctx.userId, fileId, "note.md");
    const bytes = new TextEncoder().encode(input.content);
    yield* storage.put(storageKey, bytes, { contentType: "text/markdown" });
    yield* database.useTransaction(async (tx) => {
      await tx.insert(item).values({
        id: fileId,
        userId: ctx.userId,
        kind: "note",
        title: input.title,
        source: "ruth",
        placement: input.folder === undefined ? "inbox" : "filed",
        storageKey,
        mimeType: "text/markdown",
        sizeBytes: bytes.byteLength,
        dedupeKey: `ruth-note:${fileId}`,
      });
      if (input.folder !== undefined)
        await tx
          .insert(itemCluster)
          .values({ userId: ctx.userId, itemId: fileId, clusterId: input.folder });
    });
    yield* recordItemEvent(ctx.userId, fileId, "uploaded");
    yield* enqueueIngestion(ctx.userId, fileId);
    const cache = yield* SemanticCache;
    yield* cache.invalidate(ctx.userId);
    return { fileId, summary: `Created the note "${input.title}".` };
  }),
  move_file: Effect.fn("RuthKit.moveFile")(function* (input, ctx) {
    const database = yield* Database;
    const moved = yield* database.useTransaction(async (tx) => {
      const target = await tx.query.cluster.findFirst({
        columns: { id: true },
        where: and(eq(cluster.id, input.folder), eq(cluster.userId, ctx.userId)),
      });
      const owned = await tx.query.item.findFirst({
        columns: { id: true },
        where: and(
          eq(item.id, input.fileId),
          eq(item.userId, ctx.userId),
          ne(item.placement, "archived"),
          isNull(item.archivedAt),
        ),
      });
      if (!target || !owned) return false;
      await tx
        .delete(itemCluster)
        .where(and(eq(itemCluster.itemId, input.fileId), eq(itemCluster.userId, ctx.userId)));
      await tx
        .insert(itemCluster)
        .values({ itemId: input.fileId, clusterId: input.folder, userId: ctx.userId });
      await tx
        .update(item)
        .set({ placement: "filed", updatedAt: sql`now()` })
        .where(and(eq(item.id, input.fileId), eq(item.userId, ctx.userId)));
      return true;
    });
    if (!moved) return yield* new NotFound({ entity: "File or folder", id: input.fileId });
    const cache = yield* SemanticCache;
    yield* cache.invalidate(ctx.userId);
    return { fileId: input.fileId, summary: "Moved the file to another folder." };
  }),
  rename_file: Effect.fn("RuthKit.renameFile")(function* (input, ctx) {
    const database = yield* Database;
    const rows = yield* database.use((db) =>
      db
        .update(item)
        .set({ title: input.title, updatedAt: sql`now()` })
        .where(
          and(
            eq(item.id, input.fileId),
            eq(item.userId, ctx.userId),
            ne(item.placement, "archived"),
            isNull(item.archivedAt),
          ),
        )
        .returning({ id: item.id }),
    );
    if (rows.length === 0) return yield* new NotFound({ entity: "File", id: input.fileId });
    // A title is indexed, so re-ingest; it isn't a content change, so no `edited` event.
    yield* enqueueIngestion(ctx.userId, input.fileId);
    const cache = yield* SemanticCache;
    yield* cache.invalidate(ctx.userId);
    return { fileId: input.fileId, summary: `Renamed the file to "${input.title}".` };
  }),
  archive_file: Effect.fn("RuthKit.archiveFile")(function* (input, ctx) {
    yield* archiveItem(ctx.userId, input.fileId);
    return { fileId: input.fileId, summary: "Archived the file. You can undo this for 30 days." };
  }),
  render_widget: Effect.fn("RuthKit.renderWidget")(function* (input, ctx) {
    const widgets = yield* WidgetStore;
    return yield* widgets.render(ctx, input);
  }),
};
