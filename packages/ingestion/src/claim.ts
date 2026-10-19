/** A renewable claim owns one execution, independently from its queued generation. */
import type { FileId, IngestionJobId, UserId } from "@avenire/contracts";
import type { DatabaseTransaction } from "@avenire/database/client";
import { lockCorpus } from "@avenire/database/corpus";
import { file, ingestionJob } from "@avenire/database/schema";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import * as Schema from "effect/Schema";

export interface IngestionClaim {
  readonly id: IngestionJobId;
  readonly userId: UserId;
  readonly fileId: FileId;
  readonly generation: number;
  readonly claimToken: string;
}

export interface SourceSnapshot {
  readonly title: string;
  readonly storageKey: string | null;
  readonly sourceUrl: string | null;
  readonly updatedAt?: Date;
  readonly documentKey?: string | null;
}

export class IngestionLeaseLost extends Schema.TaggedError<IngestionLeaseLost>()(
  "IngestionLeaseLost",
  { fileId: Schema.String },
) {}

export const claimPredicate = (claim: IngestionClaim) =>
  and(
    eq(ingestionJob.id, claim.id),
    eq(ingestionJob.userId, claim.userId),
    eq(ingestionJob.fileId, claim.fileId),
    eq(ingestionJob.generation, claim.generation),
    eq(ingestionJob.claimToken, claim.claimToken),
    gt(ingestionJob.lockedUntil, sql`now()`),
  );

/** Lock order is user -> source -> claim. Locks last until all canonical writes commit. */
export const ownsPublication = async (
  tx: DatabaseTransaction,
  claim: IngestionClaim,
  source?: SourceSnapshot,
): Promise<boolean> => {
  await lockCorpus(tx, claim.userId);
  const [current] = await tx
    .select({
      title: file.title,
      storageKey: file.storageKey,
      sourceUrl: file.sourceUrl,
      updatedAt: file.updatedAt,
      documentKey: file.documentKey,
    })
    .from(file)
    .where(
      and(
        eq(file.id, claim.fileId),
        eq(file.userId, claim.userId),
        isNull(file.archivedAt),
        isNull(file.purgeStartedAt),
        ne(file.placement, "archived"),
      ),
    )
    .for("update");
  if (
    !current ||
    (source !== undefined &&
      (current.title !== source.title ||
        current.storageKey !== source.storageKey ||
        current.sourceUrl !== source.sourceUrl ||
        (source.updatedAt !== undefined &&
          current.updatedAt.getTime() !== source.updatedAt.getTime()) ||
        (source.documentKey !== undefined && current.documentKey !== source.documentKey)))
  )
    return false;
  const [job] = await tx
    .select({ id: ingestionJob.id })
    .from(ingestionJob)
    .where(claimPredicate(claim))
    .for("update");
  return job !== undefined;
};
