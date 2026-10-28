/**
 * Read-only filing check: runs ingestion's classifier over every indexed file of one account
 * and prints where each would be filed today, next to where it currently is. The transaction is
 * read-only and rolled back, so nothing moves.
 *   pnpm --filter @avenire/web filing:dry-run -- someone@example.com
 */
import { UserId } from "@avenire/contracts";
import { makeDatabase } from "@avenire/database/client";
import * as schema from "@avenire/database/schema";
import { classifyFileTx, rankFoldersTx, runReadFoldersTx } from "@avenire/ingestion/folder";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

const email = process.argv.slice(2).find((arg) => arg !== "--");
if (!email) throw new Error("Pass the account email");
const { db, sql: client } = makeDatabase(process.env.DATABASE_URL!);
const { file, fileFolder, folder, chunk, user } = schema;

const rows: Array<Record<string, string>> = [];
class Rollback extends Error {}
await db
  .transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!owner) throw new Error(`No account for ${email}`);
    const userId = UserId.make(owner.id);
    const names = new Map(
      (
        await tx
          .select({ id: folder.id, name: folder.name, suggested: folder.suggested })
          .from(folder)
          .where(eq(folder.userId, userId))
      ).map((row) => [row.id, `${row.name.slice(0, 28)}${row.suggested ? " (suggested)" : ""}`]),
    );
    const files = await tx
      .select({
        id: file.id,
        title: file.title,
        source: file.source,
        dedupeKey: file.dedupeKey,
        vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(chunk.embedding),
      })
      .from(file)
      .innerJoin(chunk, and(eq(chunk.fileId, file.id), eq(chunk.userId, file.userId)))
      .where(and(eq(file.userId, userId), isNull(file.archivedAt), ne(file.placement, "archived")))
      .groupBy(file.id)
      .orderBy(file.source, file.title);
    for (const target of files) {
      if (target.vector == null) continue;
      const current = await tx
        .select({ id: fileFolder.folderId })
        .from(fileFolder)
        .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, target.id)));
      const read =
        target.source === "ruth-cloud" ? await runReadFoldersTx(tx, userId, target.dedupeKey) : [];
      const ranked = await rankFoldersTx(tx, userId, target.vector, read.length ? read : undefined);
      const decision = await classifyFileTx(tx, userId, target, target.vector);
      rows.push({
        title: target.title.slice(0, 40),
        source: target.source,
        scope: read.length ? `run read ${read.length}` : "library",
        now: current.map((row) => names.get(row.id) ?? row.id).join(", ") || "Inbox",
        top: ranked
          .map((row) => `${names.get(row.id)?.slice(0, 18)} ${row.similarity.toFixed(3)}`)
          .join(" | "),
        decision:
          decision.folderId === null
            ? `Inbox (${decision.reason})`
            : `${names.get(decision.folderId)}`,
      });
    }
    throw new Rollback();
  })
  .catch((error) => {
    if (!(error instanceof Rollback)) throw error;
  })
  .finally(() => client.end());
console.table(rows);
