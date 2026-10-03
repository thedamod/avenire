import { ClusterId as ClusterIdSchema, type ClusterId, type ItemId, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { cluster, itemCluster } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { and, eq, sql } from "drizzle-orm";

export class ClusterError extends Schema.TaggedError<ClusterError>()("ClusterError", { cause: Schema.Defect() }) {}

export const meanVector = (vectors: ReadonlyArray<ReadonlyArray<number>>): ReadonlyArray<number> => {
  if (!vectors.length) return [];
  return (vectors[0] ?? []).map((_, index) => vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0) / vectors.length);
};

export const cosineSimilarity = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const a = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const b = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return a && b ? dot / (a * b) : 0;
};

export const runningMean = (current: ReadonlyArray<number>, count: number, next: ReadonlyArray<number>) =>
  next.map((value, index) => ((current[index] ?? 0) * count + value) / (count + 1));

export const assignClusters = (userId: UserId, itemId: ItemId, itemVector: ReadonlyArray<number>, title: string) =>
  Effect.gen(function* () {
    const database = yield* Database;
    const clusterId = yield* newId(ClusterIdSchema);
    return yield* database.useTransaction(async (tx) => {
      const vectorText = `[${itemVector.join(",")}]`;
      const nearest = await tx.select({ id: cluster.id, centroid: cluster.centroid })
        .from(cluster).where(and(eq(cluster.userId, userId), sql`${cluster.centroid} IS NOT NULL`))
        .orderBy(sql`${cluster.centroid} <=> ${vectorText}::vector`).limit(1);
      let targetId: string;
      if (nearest[0]?.centroid && cosineSimilarity(nearest[0].centroid, itemVector) >= 0.8) {
        targetId = nearest[0].id;
        const membership = await tx.select({ itemId: itemCluster.itemId }).from(itemCluster)
          .where(and(eq(itemCluster.userId, userId), eq(itemCluster.clusterId, targetId), eq(itemCluster.itemId, itemId))).limit(1);
        const members = await tx.select({ count: sql<number>`count(*)::int` }).from(itemCluster)
          .where(and(eq(itemCluster.userId, userId), eq(itemCluster.clusterId, targetId)));
        if (!membership.length) {
          await tx.update(cluster).set({ centroid: [...runningMean(nearest[0].centroid, members[0]?.count ?? 1, itemVector)], updatedAt: sql`now()` })
            .where(and(eq(cluster.id, targetId), eq(cluster.userId, userId)));
        }
      } else {
        targetId = clusterId;
        await tx.insert(cluster).values({ id: targetId, userId, name: title.slice(0, 48) || "Untitled", suggested: true, centroid: [...itemVector] });
      }
      await tx.insert(itemCluster).values({ itemId, clusterId: targetId, userId }).onConflictDoNothing();
      return targetId as ClusterId;
    }).pipe(Effect.mapError((cause) => new ClusterError({ cause })));
  });
