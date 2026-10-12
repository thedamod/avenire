import { Database } from "@avenire/database/client";
import { user } from "@avenire/database/schema";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { createHash } from "node:crypto";
import type { AgentContext } from "../tools/core.ts";

/** A stable suffix prevents equal display names from sharing a filesystem namespace. */
export const userInputsSlug = (name: string | null | undefined, id: string) => {
  const safe = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `${safe || "user"}-${createHash("sha256").update(id).digest("hex").slice(0, 10)}`;
};
export const inputsRootFor = Effect.fn("Cloud.inputsRootFor")(function* (
  ctx: Pick<AgentContext, "userId">,
) {
  const db = yield* Database;
  const slug = yield* db.useTransaction(async (tx) => {
    const [person] = await tx.select().from(user).where(eq(user.id, ctx.userId)).for("update");
    const value = person?.cloudInputsSlug ?? userInputsSlug(person?.name, ctx.userId);
    if (person && !person.cloudInputsSlug)
      await tx.update(user).set({ cloudInputsSlug: value }).where(eq(user.id, ctx.userId));
    return value;
  });
  return `/home/daytona/.avenire/${slug}`;
});
export const RUN_WALL_CLOCK = 4 * 60 * 60 * 1000;
export const runPaths = (runId: string) => {
  const runDir = `/home/daytona/workspace/runs/${runId}`;
  return { runDir, outDir: `${runDir}/out` };
};
