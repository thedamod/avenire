import {
  FolderId,
  NotFound,
  type FileId,
  type FileSelector,
  type UserId,
} from "@avenire/contracts";
import { Database, type DatabaseTransaction } from "@avenire/database/client";
import {
  advanceCorpusRevision,
  lockCorpus,
  refreshFolderCentroidsTx,
} from "@avenire/database/corpus";
import { chunk, cloudHydration, file, fileFolder, folder } from "@avenire/database/schema";
import { and, cosineDistance, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export { refreshFolderCentroidsTx } from "@avenire/database/corpus";

export class FolderError extends Schema.TaggedError<FolderError>()("FolderError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Folder assignment failed: ${detail}`;
  }
}

export const cosineSimilarity = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
): number => {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const a = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const b = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return a && b ? dot / (a * b) : 0;
};

/**
 * One filing rule for every file, whatever its origin. A file joins its nearest notebook only
 * when it clears the bar and beats the runner-up by the margin; otherwise it stays in the
 * Inbox. Filing never creates notebooks: only the user (or an accepted proposal) does.
 */
export const FILING = {
  /** Any accepted notebook may claim an uploaded or captured source. */
  library: { threshold: 0.8, margin: 0.05 },
  /**
   * A Ruth Cloud output only competes for the notebooks its run read. Generated summaries sit
   * well below their sources' centroid (0.50–0.77 measured), so the scoped bar is lower.
   */
  readByRun: { threshold: 0.4, margin: 0.05 },
} as const;

export type FilingRule = (typeof FILING)[keyof typeof FILING];
export type RankedFolder = { readonly id: string; readonly similarity: number };
export type FilingDecision =
  | { readonly folderId: FolderId; readonly similarity: number }
  | { readonly folderId: null; readonly reason: "no-candidates" | "below-threshold" | "ambiguous" };

/** `ranked` is ordered by similarity, best first; only the top two matter. */
export const decideFolder = (
  ranked: ReadonlyArray<RankedFolder>,
  rule: FilingRule,
): FilingDecision => {
  const [best, runnerUp] = ranked;
  if (!best) return { folderId: null, reason: "no-candidates" };
  if (best.similarity < rule.threshold) return { folderId: null, reason: "below-threshold" };
  if (runnerUp && best.similarity - runnerUp.similarity < rule.margin)
    return { folderId: null, reason: "ambiguous" };
  return { folderId: FolderId.make(best.id), similarity: best.similarity };
};

/** The nearest accepted notebooks; suggested (unreviewed) ones never attract files. */
export const rankFoldersTx = (
  tx: DatabaseTransaction,
  userId: UserId,
  vector: ReadonlyArray<number>,
  onlyIds?: ReadonlyArray<string>,
  limit = 2,
): Promise<ReadonlyArray<RankedFolder>> =>
  tx
    .select({ id: folder.id, centroid: folder.centroid })
    .from(folder)
    .where(
      and(
        eq(folder.userId, userId),
        isNull(folder.archivedAt),
        isNotNull(folder.centroid),
        eq(folder.suggested, false),
        onlyIds ? inArray(folder.id, [...onlyIds]) : undefined,
      ),
    )
    .orderBy(cosineDistance(folder.centroid, [...vector]), folder.id)
    .limit(limit)
    .then((rows) =>
      rows.map((row) => ({ id: row.id, similarity: cosineSimilarity(row.centroid!, vector) })),
    );

const selectorFolderIds = (selector: FileSelector): ReadonlyArray<string> => [
  ...(selector.explicit?.folderIds ?? []),
  ...(selector.filters?.folderIds ?? []),
];

/**
 * Notebooks a Ruth Cloud run was allowed to read: folders it selected plus the notebooks of the
 * files it hydrated. The run id comes from the output's `ruth-cloud:<runId>:<fileId>` key.
 */
export const runReadFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  dedupeKey: string,
): Promise<ReadonlyArray<string>> => {
  const [prefix, runId] = dedupeKey.split(":");
  if (prefix !== "ruth-cloud" || !runId) return [];
  const hydrations = await tx
    .select({ selector: cloudHydration.selector, files: cloudHydration.files })
    .from(cloudHydration)
    .where(and(eq(cloudHydration.userId, userId), eq(cloudHydration.runId, runId)));
  const fileIds = [
    ...new Set(hydrations.flatMap((row) => row.files.map((hydrated) => hydrated.fileId))),
  ];
  const members = fileIds.length
    ? await tx
        .selectDistinct({ id: fileFolder.folderId })
        .from(fileFolder)
        .where(and(eq(fileFolder.userId, userId), inArray(fileFolder.fileId, fileIds)))
    : [];
  return [
    ...new Set([
      ...hydrations.flatMap((row) => selectorFolderIds(row.selector)),
      ...members.map((row) => row.id),
    ]),
  ].sort();
};

/** Ruth Cloud outputs are scoped to what their run read; everything else uses the library rule. */
export const classifyFileTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  target: { readonly source: string; readonly dedupeKey: string },
  vector: ReadonlyArray<number>,
): Promise<FilingDecision> => {
  const read =
    target.source === "ruth-cloud" ? await runReadFoldersTx(tx, userId, target.dedupeKey) : [];
  return read.length > 0
    ? decideFolder(await rankFoldersTx(tx, userId, vector, read), FILING.readByRun)
    : decideFolder(await rankFoldersTx(tx, userId, vector), FILING.library);
};

/**
 * Below this a notebook is not worth offering. Unrelated files still land around 0.33–0.40
 * against the nearest notebook, so the floor sits above that until a model judges candidates.
 */
const SUGGEST_FLOOR = 0.42;
export type FolderSuggestion = {
  readonly folderId: FolderId;
  /** Null for an output that can't be embedded, suggested because its run read that notebook. */
  readonly similarity: number | null;
};

/**
 * The most likely notebooks for one file, best first, for a person to pick from. Unlike
 * `classifyFileTx` this never declines: it ranks below the filing bar too. A Ruth Cloud output
 * puts the notebooks its run read first.
 */
export const suggestFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  limit = 3,
): Promise<ReadonlyArray<FolderSuggestion>> => {
  const [target] = await tx
    .select({ source: file.source, dedupeKey: file.dedupeKey })
    .from(file)
    .where(and(eq(file.id, fileId), eq(file.userId, userId), isNull(file.archivedAt)));
  if (!target) return [];
  const [embedding] = await tx
    .select({
      vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(chunk.embedding),
    })
    .from(chunk)
    .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)));
  const vector = embedding?.vector ?? null;
  const read =
    target.source === "ruth-cloud" ? await runReadFoldersTx(tx, userId, target.dedupeKey) : [];
  const ranked: Array<FolderSuggestion> = [];
  const add = (id: string, similarity: number | null) => {
    if (ranked.length < limit && !ranked.some((row) => row.folderId === id))
      ranked.push({ folderId: FolderId.make(id), similarity });
  };
  if (vector === null) {
    if (read.length === 0) return [];
    const live = await tx
      .select({ id: folder.id })
      .from(folder)
      .where(
        and(
          eq(folder.userId, userId),
          inArray(folder.id, [...read]),
          isNull(folder.archivedAt),
          eq(folder.suggested, false),
        ),
      )
      .orderBy(folder.id);
    for (const row of live) add(row.id, null);
    return ranked;
  }
  if (read.length > 0)
    for (const row of await rankFoldersTx(tx, userId, vector, read, limit))
      add(row.id, row.similarity);
  for (const row of await rankFoldersTx(tx, userId, vector, undefined, limit))
    if (row.similarity >= SUGGEST_FLOOR) add(row.id, row.similarity);
  return ranked;
};

/** What a judge sees for one file: an excerpt of it and the notebooks worth asking about. */
export type FilingContext = {
  readonly fileId: FileId;
  readonly title: string;
  readonly kind: string;
  readonly contentHash: string | null;
  readonly excerpt: string;
  /** Embedding (and run) suggestions, best first, as the fallback answer. */
  readonly ranked: ReadonlyArray<FolderSuggestion>;
  readonly candidates: ReadonlyArray<{
    readonly folderId: FolderId;
    readonly name: string;
    /** A few member titles, so the judge sees what the notebook holds. */
    readonly samples: ReadonlyArray<string>;
    /** Opening text of a member file: names can be opaque course codes. */
    readonly excerpt: string;
    /** Embedding similarity to the file; null for an empty notebook. */
    readonly similarity: number | null;
  }>;
};

const SHORTLIST_FLOOR = 0.2;
const EXCERPT_CHARS = 1_500;
const CANDIDATE_EXCERPT_CHARS = 400;

/**
 * The shortlist for a judge: the run's notebooks, the nearest notebooks by embedding (with a
 * low floor, since the judge decides), and empty notebooks, which only a name can match.
 */
export const filingContextTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
): Promise<FilingContext | null> => {
  const [target] = await tx
    .select({
      title: file.title,
      kind: file.kind,
      contentHash: file.contentHash,
      source: file.source,
      dedupeKey: file.dedupeKey,
    })
    .from(file)
    .where(and(eq(file.id, fileId), eq(file.userId, userId), isNull(file.archivedAt)));
  if (!target) return null;
  const chunks = await tx
    .select({ content: chunk.content })
    .from(chunk)
    .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)))
    .orderBy(chunk.ordinal)
    .limit(4);
  const [embedding] = await tx
    .select({
      vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(chunk.embedding),
    })
    .from(chunk)
    .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)));
  const vector = embedding?.vector ?? null;
  const read =
    target.source === "ruth-cloud" ? await runReadFoldersTx(tx, userId, target.dedupeKey) : [];
  const ids = new Set(read);
  const similarity = new Map<string, number>();
  if (vector !== null) {
    for (const row of await rankFoldersTx(tx, userId, vector, undefined, 3))
      if (row.similarity >= SHORTLIST_FLOOR) ids.add(row.id);
    if (ids.size)
      for (const row of await rankFoldersTx(tx, userId, vector, [...ids], ids.size))
        similarity.set(row.id, row.similarity);
  }
  const empty = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(
      and(
        eq(folder.userId, userId),
        isNull(folder.archivedAt),
        eq(folder.suggested, false),
        isNull(folder.centroid),
      ),
    )
    .orderBy(folder.id)
    .limit(5);
  for (const row of empty) ids.add(row.id);
  const folders = ids.size
    ? await tx
        .select({ id: folder.id, name: folder.name })
        .from(folder)
        .where(
          and(
            eq(folder.userId, userId),
            inArray(folder.id, [...ids]),
            isNull(folder.archivedAt),
            eq(folder.suggested, false),
          ),
        )
        .orderBy(folder.id)
    : [];
  const members = folders.length
    ? await tx
        .select({ folderId: fileFolder.folderId, fileId: file.id, title: file.title })
        .from(fileFolder)
        .innerJoin(file, and(eq(file.id, fileFolder.fileId), eq(file.userId, fileFolder.userId)))
        .where(
          and(
            eq(fileFolder.userId, userId),
            inArray(
              fileFolder.folderId,
              folders.map((row) => row.id),
            ),
            ne(file.id, fileId),
            isNull(file.archivedAt),
          ),
        )
        .orderBy(desc(file.createdAt))
    : [];
  return {
    fileId,
    title: target.title,
    kind: target.kind,
    contentHash: target.contentHash,
    excerpt: chunks
      .map((row) => row.content)
      .join("\n")
      .slice(0, EXCERPT_CHARS),
    ranked: await suggestFoldersTx(tx, userId, fileId),
    candidates: await Promise.all(
      folders.map(async (row) => {
        const own = members.filter((member) => member.folderId === row.id);
        const [opening] = own.length
          ? await tx
              .select({ content: chunk.content })
              .from(chunk)
              .where(
                and(
                  eq(chunk.userId, userId),
                  inArray(
                    chunk.fileId,
                    own.map((member) => member.fileId),
                  ),
                ),
              )
              .orderBy(chunk.ordinal, chunk.fileId)
              .limit(1)
          : [];
        return {
          folderId: FolderId.make(row.id),
          name: row.name,
          samples: own.slice(0, 4).map((member) => member.title),
          excerpt: opening?.content.slice(0, CANDIDATE_EXCERPT_CHARS) ?? "",
          similarity: similarity.get(row.id) ?? null,
        };
      }),
    ),
  };
};

export const filingContexts = Effect.fn("Folders.filingContexts")(function* (
  userId: UserId,
  fileIds: ReadonlyArray<FileId>,
) {
  const database = yield* Database;
  return yield* database
    .useTransaction(async (tx) => {
      const out: Array<FilingContext> = [];
      for (const fileId of fileIds) {
        // eslint-disable-next-line no-await-in-loop
        const context = await filingContextTx(tx, userId, fileId);
        if (context) out.push(context);
      }
      return out;
    })
    .pipe(Effect.mapError((cause) => new FolderError({ cause })));
});

/** Every membership mutation takes locks in the same order as corpus publication. */
const lockLiveFile = async (tx: DatabaseTransaction, userId: UserId, fileId: FileId) => {
  await lockCorpus(tx, userId);
  const [owned] = await tx
    .select({ id: file.id, source: file.source, dedupeKey: file.dedupeKey })
    .from(file)
    .where(
      and(
        eq(file.id, fileId),
        eq(file.userId, userId),
        isNull(file.archivedAt),
        isNull(file.purgeStartedAt),
        ne(file.placement, "archived"),
      ),
    )
    .for("update");
  return owned;
};

/** Lock the complete affected set in id order, after the corpus and file locks. */
const lockOwnedFolders = async (
  tx: DatabaseTransaction,
  userId: UserId,
  folderIds: ReadonlyArray<string>,
): Promise<boolean> => {
  const ids = [...new Set(folderIds)].sort();
  if (ids.length === 0) return true;
  const owned = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(and(eq(folder.userId, userId), inArray(folder.id, ids)))
    .orderBy(folder.id)
    .for("update");
  return owned.length === ids.length;
};

/**
 * Replace all memberships and maintain their aggregates in the caller's transaction.
 * A missing or inaccessible file/folder leaves both memberships and placement intact.
 * The corpus lock also serializes this operation with embedding publication and archive.
 * This helper advances the corpus revision; callers must not advance it again.
 */
export const setFileFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  folderIds: ReadonlyArray<FolderId>,
): Promise<boolean> => {
  if (!(await lockLiveFile(tx, userId, fileId))) return false;
  const ids = [...new Set(folderIds)].sort();
  const previous = await tx
    .select({ id: fileFolder.folderId })
    .from(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)));
  const affected = [...new Set([...ids, ...previous.map((row) => row.id)])].sort();
  if (!(await lockOwnedFolders(tx, userId, affected))) return false;
  if (
    ids.length &&
    (
      await tx
        .select({ id: folder.id })
        .from(folder)
        .where(and(eq(folder.userId, userId), inArray(folder.id, ids), isNull(folder.archivedAt)))
    ).length !== ids.length
  )
    return false;
  await tx
    .delete(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)));
  if (ids.length > 0) {
    await tx.insert(fileFolder).values(ids.map((folderId) => ({ userId, fileId, folderId })));
  }
  await tx
    .update(file)
    .set({ placement: ids.length > 0 ? "filed" : "inbox", updatedAt: sql`now()` })
    .where(and(eq(file.id, fileId), eq(file.userId, userId)));
  await refreshFolderCentroidsTx(tx, userId, affected);
  await advanceCorpusRevision(tx, userId);
  return true;
};

export const setFileFolders = Effect.fn("Folders.setFileFolders")(function* (
  userId: UserId,
  fileId: FileId,
  folderIds: ReadonlyArray<FolderId>,
) {
  const database = yield* Database;
  const changed = yield* database.useTransaction((tx) =>
    setFileFoldersTx(tx, userId, fileId, folderIds),
  );
  if (!changed) return yield* new NotFound({ entity: "File or folder", id: fileId });
});

/**
 * Assign from the embeddings just published in this transaction. Existing memberships
 * remain authoritative on reingestion; their aggregate is rebuilt from current chunks.
 * An unmatched file stays in the Inbox. A matched one is filed, so membership and
 * placement agree. The caller advances the corpus revision once publication commits.
 */
export const assignFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
): Promise<FolderId | null> => {
  const owned = await lockLiveFile(tx, userId, fileId);
  if (!owned) return null;
  const previous = await tx
    .select({ id: fileFolder.folderId })
    .from(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)))
    .orderBy(fileFolder.folderId);
  if (previous.length > 0) {
    if (
      !(await lockOwnedFolders(
        tx,
        userId,
        previous.map((row) => row.id),
      ))
    )
      return null;
    await refreshFolderCentroidsTx(
      tx,
      userId,
      previous.map((row) => row.id),
    );
    return FolderId.make(previous[0]!.id);
  }
  const [fileEmbedding] = await tx
    .select({
      vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(chunk.embedding),
    })
    .from(chunk)
    .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)));
  const vector = fileEmbedding?.vector;
  if (vector == null) return null;
  const decision = await classifyFileTx(tx, userId, owned, vector);
  const folderId = decision.folderId;
  if (folderId === null || !(await lockOwnedFolders(tx, userId, [folderId]))) return null;
  await tx.insert(fileFolder).values({ fileId, folderId, userId }).onConflictDoNothing();
  await tx
    .update(file)
    .set({ placement: "filed", updatedAt: sql`now()` })
    .where(and(eq(file.id, fileId), eq(file.userId, userId)));
  await refreshFolderCentroidsTx(tx, userId, [folderId]);
  return folderId;
};

export const assignFolders = Effect.fn("Folders.assign")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  return yield* database
    .useTransaction(async (tx) => {
      const result = await assignFoldersTx(tx, userId, fileId);
      if (result !== null) await advanceCorpusRevision(tx, userId);
      return result;
    })
    .pipe(Effect.mapError((cause) => new FolderError({ cause })));
});
