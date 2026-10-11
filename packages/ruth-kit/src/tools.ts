import { ChunkId, FolderId, FileId, NotFound } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, folder, file, fileFolder } from "@avenire/database/schema";
import { archiveFile } from "@avenire/ingestion/archive";
import { recordFileEvent } from "@avenire/ingestion/events";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { Analytics } from "@avenire/shared/observability";
import { fileSourceKey } from "@avenire/storage/keys";
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
const ownedFile = Effect.fn("RuthKit.ownedFile")(function* (ctx: AgentContext, fileId: FileId) {
  const database = yield* Database;
  const row = yield* database.use((db) =>
    db.query.file.findFirst({
      columns: { id: true },
      where: and(
        eq(file.id, fileId),
        eq(file.userId, ctx.userId),
        ne(file.placement, "archived"),
        isNull(file.archivedAt),
      ),
    }),
  );
  if (!row) return yield* new NotFound({ entity: "File", id: fileId });
});
const ownedFolder = Effect.fn("RuthKit.ownedFolder")(function* (
  ctx: AgentContext,
  folderId: FolderId,
) {
  const database = yield* Database;
  const row = yield* database.use((db) =>
    db.query.folder.findFirst({
      columns: { id: true },
      where: and(eq(folder.id, folderId), eq(folder.userId, ctx.userId)),
    }),
  );
  if (!row) return yield* new NotFound({ entity: "Folder", id: folderId });
});
const FolderEntry = Schema.Struct({
  folderId: FolderId,
  name: Schema.String,
  fileCount: Schema.Int,
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
        fileId: hit.fileId,
        title: hit.fileTitle,
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
    if (input.folderId !== undefined && input.folderId !== "inbox")
      yield* ownedFolder(ctx, input.folderId);
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
            ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
          },
        ),
      ),
    );
    const candidates = yield* Schema.decodeUnknownEffect(Schema.Array(MetadataCandidate))(rows);
    const selected = candidates.slice(0, limit);
    const folders =
      input.folderId !== undefined
        ? []
        : yield* database.use((db) =>
            db.execute(sql`
      SELECT c.id AS "folderId", c.name, count(i.id)::int AS "fileCount"
      FROM folder c LEFT JOIN file_folder ic ON ic.folder_id = c.id AND ic.user_id = c.user_id
      LEFT JOIN file i ON i.id = ic.file_id AND i.user_id = c.user_id AND i.placement <> 'archived' AND i.archived_at IS NULL
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
    yield* ownedFile(ctx, input.fileId);
    const database = yield* Database;
    const rows = yield* database.use((db) =>
      db
        .select({
          chunkId: chunk.id,
          title: file.title,
          location: chunk.location,
          content: chunk.content,
        })
        .from(chunk)
        .innerJoin(file, eq(chunk.fileId, file.id))
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.userId, ctx.userId),
            ne(file.placement, "archived"),
            isNull(file.archivedAt),
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
      fileId: input.fileId,
    }));
  }),
  write_file: Effect.fn("RuthKit.writeFile")(function* (input, ctx) {
    if (input.folderId !== undefined) yield* ownedFolder(ctx, input.folderId);
    const storage = yield* Storage;
    const database = yield* Database;
    const fileId = yield* newId(FileId);
    const storageKey = fileSourceKey(ctx.userId, fileId, "note.md");
    const bytes = new TextEncoder().encode(input.content);
    yield* storage.put(storageKey, bytes, { contentType: "text/markdown" });
    yield* database.useTransaction(async (tx) => {
      await tx.insert(file).values({
        id: fileId,
        userId: ctx.userId,
        kind: "note",
        title: input.title,
        source: "ruth",
        placement: input.folderId === undefined ? "inbox" : "filed",
        storageKey,
        mimeType: "text/markdown",
        sizeBytes: bytes.byteLength,
        dedupeKey: `ruth-note:${fileId}`,
      });
      if (input.folderId !== undefined)
        await tx
          .insert(fileFolder)
          .values({ userId: ctx.userId, fileId: fileId, folderId: input.folderId });
    });
    yield* recordFileEvent(ctx.userId, fileId, "uploaded");
    yield* enqueueIngestion(ctx.userId, fileId);
    const cache = yield* SemanticCache;
    yield* cache.invalidate(ctx.userId);
    return { fileId, summary: `Created the note "${input.title}".` };
  }),
  move_file: Effect.fn("RuthKit.moveFile")(function* (input, ctx) {
    const database = yield* Database;
    const moved = yield* database.useTransaction(async (tx) => {
      const target = await tx.query.folder.findFirst({
        columns: { id: true },
        where: and(eq(folder.id, input.folderId), eq(folder.userId, ctx.userId)),
      });
      const owned = await tx.query.file.findFirst({
        columns: { id: true },
        where: and(
          eq(file.id, input.fileId),
          eq(file.userId, ctx.userId),
          ne(file.placement, "archived"),
          isNull(file.archivedAt),
        ),
      });
      if (!target || !owned) return false;
      await tx
        .delete(fileFolder)
        .where(and(eq(fileFolder.fileId, input.fileId), eq(fileFolder.userId, ctx.userId)));
      await tx
        .insert(fileFolder)
        .values({ fileId: input.fileId, folderId: input.folderId, userId: ctx.userId });
      await tx
        .update(file)
        .set({ placement: "filed", updatedAt: sql`now()` })
        .where(and(eq(file.id, input.fileId), eq(file.userId, ctx.userId)));
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
        .update(file)
        .set({ title: input.title, updatedAt: sql`now()` })
        .where(
          and(
            eq(file.id, input.fileId),
            eq(file.userId, ctx.userId),
            ne(file.placement, "archived"),
            isNull(file.archivedAt),
          ),
        )
        .returning({ id: file.id }),
    );
    if (rows.length === 0) return yield* new NotFound({ entity: "File", id: input.fileId });
    // A title is indexed, so re-ingest; it isn't a content change, so no `edited` event.
    yield* enqueueIngestion(ctx.userId, input.fileId);
    const cache = yield* SemanticCache;
    yield* cache.invalidate(ctx.userId);
    return { fileId: input.fileId, summary: `Renamed the file to "${input.title}".` };
  }),
  archive_file: Effect.fn("RuthKit.archiveFile")(function* (input, ctx) {
    yield* archiveFile(ctx.userId, input.fileId);
    return { fileId: input.fileId, summary: "Archived the file. You can undo this for 30 days." };
  }),
  render_widget: Effect.fn("RuthKit.renderWidget")(function* (input, ctx) {
    const widgets = yield* WidgetStore;
    return yield* widgets.render(ctx, input);
  }),
};
