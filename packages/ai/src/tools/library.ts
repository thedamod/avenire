import {
  ChunkId,
  FolderId,
  FileId,
  FileEventId,
  IngestionJobId,
  NotFound,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";
import { chunk, folder, file, fileEvent, fileFolder } from "@avenire/database/schema";
import { archiveFile } from "@avenire/storage/archive";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestionTx, renameFile } from "@avenire/ingestion/worker";
import { setFileFolders } from "@avenire/ingestion/folder";
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
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { WidgetStore, resolveWidgetSource } from "../outputs/widgets.ts";

/** enqueueIngestion requires only Database and Crypto, rather than the worker's runtime layer. */
export type RuthKitServices =
  | Database
  | Storage
  | Retrieval
  | SemanticCache
  | Crypto.Crypto
  | Analytics
  | WidgetStore
  | ChatSandboxes;
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
        isNull(file.purgeStartedAt),
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
      metadataCandidatesStatement(
        db,
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
    );
    const candidates = yield* Schema.decodeUnknownEffect(Schema.Array(MetadataCandidate))(rows);
    const selected = candidates.slice(0, limit);
    const folders =
      input.folderId !== undefined
        ? []
        : yield* database.use((db) =>
            db
              .select({
                folderId: folder.id,
                name: folder.name,
                fileCount: sql<number>`count(${file.id})::int`,
              })
              .from(folder)
              .leftJoin(
                fileFolder,
                and(eq(fileFolder.folderId, folder.id), eq(fileFolder.userId, folder.userId)),
              )
              .leftJoin(
                file,
                and(
                  eq(file.id, fileFolder.fileId),
                  eq(file.userId, folder.userId),
                  ne(file.placement, "archived"),
                  isNull(file.archivedAt),
                  isNull(file.purgeStartedAt),
                ),
              )
              .where(eq(folder.userId, ctx.userId))
              .groupBy(folder.id, folder.name)
              .orderBy(folder.name, folder.id),
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
            isNull(file.purgeStartedAt),
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
    const jobId = yield* newId(IngestionJobId);
    const eventId = yield* newId(FileEventId);
    const publish = database.useTransaction(async (tx) => {
      await lockCorpus(tx, ctx.userId);
      if (input.folderId !== undefined) {
        const [target] = await tx
          .select({ id: folder.id })
          .from(folder)
          .where(and(eq(folder.id, input.folderId), eq(folder.userId, ctx.userId)))
          .for("update");
        if (!target) return false;
      }
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
      await tx
        .insert(fileEvent)
        .values({ id: eventId, userId: ctx.userId, fileId, kind: "uploaded" });
      await enqueueIngestionTx(tx, ctx.userId, fileId, jobId);
      await advanceCorpusRevision(tx, ctx.userId);
      return true;
    });
    const published = yield* publish.pipe(
      Effect.ensuring(
        Effect.gen(function* () {
          // Preserve a source when an ambiguous database error actually committed it.
          const current = yield* database.use((db) =>
            db.query.file.findFirst({
              columns: { storageKey: true },
              where: and(eq(file.id, fileId), eq(file.userId, ctx.userId)),
            }),
          );
          if (current?.storageKey !== storageKey) yield* storage.remove(storageKey);
        }).pipe(
          Effect.catchCause((cause) => Effect.logWarning("Could not clean staged note", cause)),
        ),
      ),
    );
    if (!published) return yield* new NotFound({ entity: "Folder", id: input.folderId! });
    return { fileId, summary: `Created the note "${input.title}".` };
  }),
  move_file: Effect.fn("RuthKit.moveFile")(function* (input, ctx) {
    yield* ownedFile(ctx, input.fileId);
    yield* ownedFolder(ctx, input.folderId);
    yield* setFileFolders(ctx.userId, input.fileId, [input.folderId]);
    return { fileId: input.fileId, summary: "Moved the file to another folder." };
  }),
  rename_file: Effect.fn("RuthKit.renameFile")(function* (input, ctx) {
    yield* ownedFile(ctx, input.fileId);
    yield* renameFile(ctx.userId, input.fileId, input.title);
    return { fileId: input.fileId, summary: `Renamed the file to "${input.title}".` };
  }),
  archive_file: Effect.fn("RuthKit.archiveFile")(function* (input, ctx) {
    yield* archiveFile(ctx.userId, input.fileId);
    return { fileId: input.fileId, summary: "Archived the file. You can undo this for 30 days." };
  }),
  render_widget: Effect.fn("RuthKit.renderWidget")(function* (input, ctx) {
    const widgets = yield* WidgetStore;
    return yield* widgets.render(ctx, {
      title: input.title,
      html: yield* resolveWidgetSource(ctx, input),
    });
  }),
};
