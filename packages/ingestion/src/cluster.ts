import { ClusterId, type ItemId, type UserId } from "@avenire/contracts";
import { Database, type DatabaseTransaction } from "@avenire/database/client";
import { cluster, itemCluster } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class ClusterError extends Schema.TaggedError<ClusterError>()("ClusterError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Clustering failed: ${detail}`;
  }
}

export const meanVector = (
  vectors: ReadonlyArray<ReadonlyArray<number>>,
): ReadonlyArray<number> => {
  if (!vectors.length) return [];
  return (vectors[0] ?? []).map(
    (_, index) => vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0) / vectors.length,
  );
};

export const cosineSimilarity = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
): number => {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const a = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const b = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return a && b ? dot / (a * b) : 0;
};

export const runningMean = (
  current: ReadonlyArray<number>,
  count: number,
  next: ReadonlyArray<number>,
) => next.map((value, index) => ((current[index] ?? 0) * count + value) / (count + 1));

/** Items at least this similar to a cluster's centroid join it instead of starting a new one. */
const JOIN_THRESHOLD = 0.8;
const CLUSTER_NAME_LENGTH = 48;

const toVectorLiteral = (vector: ReadonlyArray<number>) => `[${vector.join(",")}]`;

const nearestCluster = (tx: DatabaseTransaction, userId: UserId, vector: ReadonlyArray<number>) =>
  tx
    .select({ id: cluster.id, centroid: cluster.centroid })
    .from(cluster)
    .where(and(eq(cluster.userId, userId), sql`${cluster.centroid} IS NOT NULL`))
    .orderBy(sql`${cluster.centroid} <=> ${toVectorLiteral(vector)}::vector`)
    .limit(1)
    .then(([nearest]) => nearest);

/** Folds the item into the centroid, unless it was already a member (re-ingestion). */
const updateCentroid = async (
  tx: DatabaseTransaction,
  userId: UserId,
  itemId: ItemId,
  clusterId: string,
  centroid: ReadonlyArray<number>,
  vector: ReadonlyArray<number>,
) => {
  const inCluster = and(eq(itemCluster.userId, userId), eq(itemCluster.clusterId, clusterId));
  const [membership] = await tx
    .select({ itemId: itemCluster.itemId })
    .from(itemCluster)
    .where(and(inCluster, eq(itemCluster.itemId, itemId)))
    .limit(1);
  if (membership !== undefined) return;
  const [members] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(itemCluster)
    .where(inCluster);
  await tx
    .update(cluster)
    .set({
      centroid: [...runningMean(centroid, members?.count ?? 0, vector)],
      updatedAt: sql`now()`,
    })
    .where(and(eq(cluster.id, clusterId), eq(cluster.userId, userId)));
};

/**
 * Files an item into its nearest suggested cluster, or starts a new cluster named
 * after the item. Runs in one transaction so the centroid and membership agree.
 */
export const assignClusters = Effect.fn("Clustering.assign")(function* (
  userId: UserId,
  itemId: ItemId,
  itemVector: ReadonlyArray<number>,
  title: string,
) {
  const database = yield* Database;
  const newClusterId = yield* newId(ClusterId);
  return yield* database
    .useTransaction(async (tx) => {
      const nearest = await nearestCluster(tx, userId, itemVector);
      let clusterId: ClusterId = newClusterId;
      if (nearest?.centroid && cosineSimilarity(nearest.centroid, itemVector) >= JOIN_THRESHOLD) {
        clusterId = ClusterId.make(nearest.id);
        await updateCentroid(tx, userId, itemId, clusterId, nearest.centroid, itemVector);
      } else {
        await tx.insert(cluster).values({
          id: clusterId,
          userId,
          name: title.slice(0, CLUSTER_NAME_LENGTH) || "Untitled",
          suggested: true,
          centroid: [...itemVector],
        });
      }
      await tx.insert(itemCluster).values({ itemId, clusterId, userId }).onConflictDoNothing();
      return clusterId;
    })
    .pipe(Effect.mapError((cause) => new ClusterError({ cause })));
});
