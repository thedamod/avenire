import {
  ClusterId,
  HydrationId,
  HYDRATION_DEFAULTS,
  ItemId,
  PendingApprovalId,
  StorageKey,
  WORKSPACE_CAP_BYTES,
  type HydrationRule,
  type HydratedFile,
  type ItemKind,
} from "@avenire/contracts";
import { CLOUD_INPUTS, CLOUD_WORKSPACE, CloudBoxes } from "@avenire/cloud/cloud-box";
import { Database } from "@avenire/database/client";
import {
  chunk,
  cloudHydration,
  cloudRun,
  cloudTask,
  cloudWorkspaceFile,
  cluster,
  item,
  itemCluster,
  pendingApproval,
  type CloudWorkspaceFileRow,
} from "@avenire/database/schema";
import { recordItemEvent } from "@avenire/ingestion/events";
import type { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { itemSourceKey, userPrefix } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { artifactMediaType } from "./artifacts.ts";
import { CLOUD_TOOL_POLICY, CLOUD_TOOL_SPECS } from "./cloud-specs.ts";
import { type AgentContext, RuthToolError, type ToolImpl, toToolError } from "./core.ts";
import { gatewayTool } from "./gateway.ts";
import type { VerifiedRunToken } from "./run-tokens.ts";
import { resolveSelector, type ResolvedFile } from "./selectors.ts";

export type CloudToolServices =
  | CloudBoxes
  | Database
  | Storage
  | SemanticCache
  | Crypto.Crypto
  | Retrieval;
const fail = (tool: string, message: string, code: RuthToolError["code"] = "invalid_input") =>
  new RuthToolError({ tool, code, message, recoverable: true });
const requireRun = (ctx: AgentContext, tool: string) =>
  ctx.runId
    ? Effect.succeed(ctx.runId)
    : Effect.fail(fail(tool, "A run is required for Ruth Cloud tools."));
const runningBox = Effect.fn("RuthCloud.runningBox")(function* (ctx: AgentContext, tool: string) {
  const boxes = yield* CloudBoxes;
  const box = yield* boxes.running(ctx.userId);
  if (Option.isNone(box))
    return yield* fail(tool, "The Ruth Cloud workspace is not running.", "sandbox_unavailable");
  return box.value;
});
const hashBytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const extensions: Readonly<Record<string, string>> = {
  "text/markdown": "md",
  "text/plain": "txt",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};
const kindExtensions: Record<ItemKind, string> = {
  note: "md",
  pdf: "pdf",
  image: "png",
  video: "mp4",
  audio: "mp3",
  document: "txt",
  "web-page": "html",
  selection: "txt",
};
const safe = (value: string, fallback: string) => {
  const cleaned = value
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/^\.+/, "")
    .trim();
  let result = "";
  // Leave room under Linux's 255-byte component limit for ids, disambiguation and extensions.
  for (const char of Array.from(cleaned).slice(0, 80)) {
    if (Buffer.byteLength(result + char) > 200) break;
    result += char;
  }
  return result.trim() || fallback;
};
/** Preserve short names, disambiguating shared UUIDv7 prefixes against the workspace manifest. */
export const sandboxPathFor = (
  input: {
    itemId: string;
    title: string;
    folder?: string | null;
    mimeType?: string | null;
    kind: ItemKind;
    extracted?: boolean;
  },
  occupiedPaths: ReadonlyMap<string, string> = new Map(),
) => {
  const titleExt = posix.extname(input.title).slice(1).toLowerCase();
  const ext = input.extracted
    ? "md"
    : (extensions[input.mimeType?.split(";")[0]?.trim() ?? ""] ??
      (/^[a-z0-9]{1,10}$/.test(titleExt) ? titleExt : kindExtensions[input.kind]));
  const stem = titleExt ? input.title.slice(0, -(titleExt.length + 1)) : input.title;
  const prefix = `${CLOUD_INPUTS}/${safe(input.folder ?? "Inbox", "Inbox")}/${safe(stem, "Untitled")}-${safe(input.itemId.slice(0, 8), "file")}`;
  const short = `${prefix}.${ext}`;
  const long = `${prefix}-${hashBytes(new TextEncoder().encode(input.itemId)).slice(0, 16)}.${ext}`;
  const owner = occupiedPaths.get(short);
  return occupiedPaths.get(long) === input.itemId || (owner !== undefined && owner !== input.itemId)
    ? long
    : short;
};

export interface HydrationCandidate {
  readonly itemId: string;
  readonly sandboxPath: string;
  readonly sizeBytes: number;
  readonly contentHash: string | null;
}
/** Count includes reused files; an oversized file doesn't prevent a later small file from fitting. */
export const planHydration = <A extends HydrationCandidate>(
  candidates: readonly A[],
  existing: readonly Pick<CloudWorkspaceFileRow, "itemId" | "sandboxPath" | "contentHash">[],
  limits: { maxFiles: number; maxBytes: number },
) => {
  const rows = new Map(existing.map((row) => [row.itemId, row]));
  const fetch: A[] = [],
    skipped: A[] = [];
  let bytes = 0;
  let byBytes = false;
  let byCount = false;
  for (const candidate of candidates) {
    if (fetch.length + skipped.length >= limits.maxFiles) {
      byCount = true;
      break;
    }
    const row = rows.get(candidate.itemId);
    if (
      candidate.contentHash !== null &&
      row?.contentHash === candidate.contentHash &&
      row.sandboxPath === candidate.sandboxPath
    )
      skipped.push(candidate);
    else if (candidate.sizeBytes > limits.maxBytes - bytes) byBytes = true;
    else {
      fetch.push(candidate);
      bytes += candidate.sizeBytes;
    }
  }
  return { fetch, skipped, truncated: { byCount, byBytes } };
};
/** Protect every file touched by the current run, even if it alone exceeds the cache cap. */
export const planEviction = <
  A extends Pick<CloudWorkspaceFileRow, "sizeBytes" | "lastUsedAt" | "lastRunId" | "itemId">,
>(
  rows: readonly A[],
  runId: string,
  cap = WORKSPACE_CAP_BYTES,
): A[] => {
  let bytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  const evict: A[] = [];
  for (const row of [...rows]
    .filter((row) => row.lastRunId !== runId)
    .sort(
      (a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime() || a.itemId.localeCompare(b.itemId),
    )) {
    if (bytes <= cap) break;
    evict.push(row);
    bytes -= row.sizeBytes;
  }
  return evict;
};
export const detectConflict = (
  baseHash: string,
  currentHash: string | null,
  modifiedAt: Date | string | null,
): string | null =>
  baseHash === currentHash
    ? null
    : `Changed in your library on ${modifiedAt instanceof Date ? modifiedAt.toISOString().slice(0, 10) : (modifiedAt?.slice(0, 10) ?? "an unknown date")} after Ruth Cloud copied it`;

const extractedBytes = Effect.fn("RuthCloud.extractedBytes")(function* (
  ctx: AgentContext,
  fileId: ItemId,
) {
  const database = yield* Database;
  const rows = yield* database.use((db) =>
    db.execute<{ text: string }>(
      sql`SELECT left(coalesce(string_agg(${chunk.content}, E'\n\n' ORDER BY ${chunk.ordinal}), ''), ${5 * 1024 * 1024}) AS text FROM ${chunk} WHERE ${chunk.itemId} = ${fileId} AND ${chunk.userId} = ${ctx.userId}`,
    ),
  );
  const bytes = Buffer.from(rows[0]?.text ?? "");
  let end = Math.min(bytes.length, 5 * 1024 * 1024);
  while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
  return new Uint8Array(bytes.subarray(0, end));
});
const ownedRun = Effect.fn("RuthCloud.ownedRun")(function* (ctx: AgentContext, tool: string) {
  const runId = yield* requireRun(ctx, tool);
  const database = yield* Database;
  const run = yield* database.use((db) =>
    db.query.cloudRun.findFirst({
      where: and(eq(cloudRun.id, runId), eq(cloudRun.userId, ctx.userId)),
    }),
  );
  if (!run) return yield* fail(tool, "This run was not found.", "not_found");
  return run;
});

/** Shared by the gateway and the orchestrator's pre-hydration step. */
const hydrateProgram = Effect.fn("RuthCloud.hydrateInputs")(function* (
  ctx: AgentContext,
  rule: HydrationRule,
  trigger: "pre-hydration" | "agent",
) {
  const runId = yield* requireRun(ctx, "hydrate_files");
  const limits = {
    maxFiles: rule.maxFiles ?? HYDRATION_DEFAULTS.maxFiles,
    maxBytes: rule.maxBytes ?? HYDRATION_DEFAULTS.maxBytes,
  };
  if (
    !Number.isInteger(limits.maxFiles) ||
    limits.maxFiles < 1 ||
    limits.maxFiles > 200 ||
    !Number.isInteger(limits.maxBytes) ||
    limits.maxBytes < 1 ||
    limits.maxBytes > HYDRATION_DEFAULTS.maxBytes
  )
    return yield* fail("hydrate_files", "Use 1–200 files and a byte cap from 1 byte to 1 GiB.");
  const box = yield* runningBox(ctx, "hydrate_files");
  yield* ownedRun(ctx, "hydrate_files");
  const database = yield* Database;
  const storage = yield* Storage;
  const now = yield* DateTime.now;
  const date = DateTime.toDateUtc(now);
  const resolved = yield* resolveSelector(ctx, rule.selector, { limit: limits.maxFiles, now });
  const existing = yield* database.use((db) =>
    db.query.cloudWorkspaceFile.findMany({ where: eq(cloudWorkspaceFile.userId, ctx.userId) }),
  );
  const occupiedPaths = new Map(existing.map((row) => [row.sandboxPath, row.itemId]));
  const candidates: (HydrationCandidate & {
    file: ResolvedFile;
    storageKey: string | null;
    bytes?: Uint8Array;
  })[] = [];
  for (const file of resolved.files) {
    const source = yield* database.use((db) =>
      db.query.item.findFirst({
        where: and(eq(item.id, file.fileId), eq(item.userId, ctx.userId)),
      }),
    );
    if (!source) continue;
    const extracted = !source.storageKey || ["web-page", "video", "audio"].includes(source.kind);
    const bytes = extracted ? yield* extractedBytes(ctx, file.fileId) : undefined;
    const sandboxPath = sandboxPathFor(
      {
        itemId: file.fileId,
        title: source.title,
        folder: file.drivePath.split("/")[0] ?? "Inbox",
        kind: source.kind,
        mimeType: source.mimeType,
        extracted,
      },
      occupiedPaths,
    );
    const owner = occupiedPaths.get(sandboxPath);
    if (owner !== undefined && owner !== file.fileId)
      return yield* fail(
        "hydrate_files",
        "These files have colliding workspace names. Give them distinct titles before hydrating them.",
      );
    occupiedPaths.set(sandboxPath, file.fileId);
    candidates.push({
      itemId: file.fileId,
      file,
      storageKey: source.storageKey,
      sandboxPath,
      contentHash: bytes ? hashBytes(bytes) : source.contentHash,
      sizeBytes: bytes?.byteLength ?? source.sizeBytes ?? 0,
      ...(bytes === undefined ? {} : { bytes }),
    });
  }
  const plan = planHydration(candidates, existing, limits);
  const skippedIds = new Set(plan.skipped.map((candidate) => candidate.itemId));
  const fetchIds = new Set(plan.fetch.map((candidate) => candidate.itemId));
  const files: HydratedFile[] = [];
  let fetchedBytes = 0;
  for (const candidate of candidates) {
    const skipped = skippedIds.has(candidate.itemId);
    if (!skipped && !fetchIds.has(candidate.itemId)) continue;
    const old = existing.find((row) => row.itemId === candidate.itemId);
    let size = old?.sizeBytes ?? candidate.sizeBytes;
    let hash = candidate.contentHash ?? "";
    if (!skipped) {
      const bytes = candidate.bytes ?? (yield* storage.get(StorageKey.make(candidate.storageKey!)));
      // Metadata is advisory: enforce the cap again against the bytes actually fetched.
      if (bytes.byteLength > limits.maxBytes - fetchedBytes) {
        plan.truncated.byBytes = true;
        continue;
      }
      size = bytes.byteLength;
      hash = candidate.contentHash ?? hashBytes(bytes);
      yield* box.writeFile(candidate.sandboxPath, bytes);
      if (old && old.sandboxPath !== candidate.sandboxPath) yield* box.removeFile(old.sandboxPath);
      yield* database.use((db) =>
        db
          .insert(cloudWorkspaceFile)
          .values({
            userId: ctx.userId,
            itemId: candidate.itemId,
            sandboxPath: candidate.sandboxPath,
            contentHash: hash,
            sizeBytes: size,
            hydratedAt: date,
            lastUsedAt: date,
            lastRunId: runId,
          })
          .onConflictDoUpdate({
            target: [cloudWorkspaceFile.userId, cloudWorkspaceFile.itemId],
            set: {
              sandboxPath: candidate.sandboxPath,
              contentHash: hash,
              sizeBytes: size,
              hydratedAt: date,
              lastUsedAt: date,
              lastRunId: runId,
            },
          }),
      );
      fetchedBytes += size;
    } else {
      yield* database.use((db) =>
        db
          .update(cloudWorkspaceFile)
          .set({ lastUsedAt: date, lastRunId: runId })
          .where(
            and(
              eq(cloudWorkspaceFile.userId, ctx.userId),
              eq(cloudWorkspaceFile.itemId, candidate.itemId),
            ),
          ),
      );
    }
    files.push({
      fileId: candidate.file.fileId,
      drivePath: candidate.file.drivePath,
      sandboxPath: candidate.sandboxPath,
      size,
      hash,
      reason: candidate.file.reason,
      skipped,
    });
  }
  const rows = yield* database.use((db) =>
    db.query.cloudWorkspaceFile.findMany({ where: eq(cloudWorkspaceFile.userId, ctx.userId) }),
  );
  for (const evicted of planEviction(rows, runId)) {
    yield* box.removeFile(evicted.sandboxPath);
    yield* database.use((db) =>
      db
        .delete(cloudWorkspaceFile)
        .where(
          and(
            eq(cloudWorkspaceFile.userId, ctx.userId),
            eq(cloudWorkspaceFile.itemId, evicted.itemId),
          ),
        ),
    );
  }
  const hydrationId = yield* newId(HydrationId);
  const truncated = {
    byCount: resolved.truncated || plan.truncated.byCount,
    byBytes: plan.truncated.byBytes,
  };
  yield* database.use((db) =>
    db.insert(cloudHydration).values({
      id: hydrationId,
      userId: ctx.userId,
      runId,
      selector: rule.selector,
      trigger,
      ...limits,
      files,
      totalBytes: fetchedBytes,
      truncated,
      createdAt: date,
    }),
  );
  return { hydrationId, files, totalBytes: fetchedBytes, truncated };
});
export const hydrate = Effect.fn("RuthCloud.hydrate")(
  (ctx: AgentContext, rule: HydrationRule, trigger: "pre-hydration" | "agent") =>
    hydrateProgram(ctx, rule, trigger).pipe(
      Effect.catchCause((cause) => toToolError("hydrate_files", cause)),
    ),
);

export const publishPath = (path: string): string | null => {
  if (path.includes("\0")) return null;
  const resolved = posix.resolve(CLOUD_WORKSPACE, path);
  const internal = `${CLOUD_WORKSPACE}/.avenire`;
  return resolved.startsWith(`${CLOUD_WORKSPACE}/`) &&
    resolved !== internal &&
    !resolved.startsWith(`${internal}/`)
    ? resolved
    : null;
};
const outputKind = (mime: string): ItemKind =>
  mime === "text/markdown" || mime === "text/plain"
    ? "note"
    : mime === "application/pdf"
      ? "pdf"
      : mime.startsWith("image/")
        ? "image"
        : mime.startsWith("video/")
          ? "video"
          : mime.startsWith("audio/")
            ? "audio"
            : "document";
const outputMime = (name: string) =>
  ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4" })[
    posix.extname(name).slice(1).toLowerCase()
  ] ?? artifactMediaType(name);
const publishOutput = Effect.fn("RuthCloud.publishOutput")(function* (
  input: typeof CLOUD_TOOL_SPECS.publish_output.inputSchema.Type,
  ctx: AgentContext,
) {
  const runId = yield* requireRun(ctx, "publish_output");
  const path = publishPath(input.sandboxPath);
  if (path === null)
    return yield* fail(
      "publish_output",
      "Publish a path inside the workspace and outside .avenire.",
    );
  const run = yield* ownedRun(ctx, "publish_output");
  const box = yield* runningBox(ctx, "publish_output");
  const database = yield* Database;
  const storage = yield* Storage;
  const name = posix.basename(path);
  // Check replacement eligibility before downloading or storing the proposal.
  const original =
    input.replaces === undefined
      ? undefined
      : yield* database.use((db) =>
          db.query.item.findFirst({
            where: and(eq(item.id, input.replaces!), eq(item.userId, ctx.userId)),
          }),
        );
  const workspace =
    input.replaces === undefined
      ? undefined
      : yield* database.use((db) =>
          db.query.cloudWorkspaceFile.findFirst({
            where: and(
              eq(cloudWorkspaceFile.itemId, input.replaces!),
              eq(cloudWorkspaceFile.userId, ctx.userId),
            ),
          }),
        );
  if (input.replaces !== undefined && (!original || !workspace))
    return yield* fail("publish_output", "Hydrate the file before proposing changes to it");
  const bytes = yield* box.readFile(path);
  if (bytes.byteLength > 100 * 1024 * 1024)
    return yield* fail("publish_output", "Publish a file no larger than 100 MB.");
  const hash = hashBytes(bytes);
  const now = DateTime.toDateUtc(yield* DateTime.now);
  if (original && workspace) {
    const approvalId = yield* newId(PendingApprovalId);
    // Each proposal owns its object; resolving one cannot delete another proposal's bytes.
    const key = StorageKey.make(
      `${userPrefix(ctx.userId)}.avenire/cloud/${runId}/sync/${original.id}/${approvalId}/${name}`,
    );
    yield* storage.put(key, bytes, { contentType: outputMime(name) });
    const conflict = detectConflict(
      workspace.contentHash,
      original.contentHash,
      original.contentModifiedAt,
    );
    yield* database.use((db) =>
      db.insert(pendingApproval).values({
        id: approvalId,
        userId: ctx.userId,
        runId,
        itemId: original.id,
        kind: "sync",
        status: conflict ? "conflict" : "pending",
        baseHash: workspace.contentHash,
        proposedKey: key,
        proposedHash: hash,
        proposedSize: bytes.byteLength,
        conflict,
        summary: input.title?.trim() || `Proposed changes to ${original.title}`,
        createdAt: now,
      }),
    );
    return { kind: "sync" as const, approvalId, conflict };
  }
  const fileId = yield* newId(ItemId);
  const proposedClusterId = yield* newId(ClusterId);
  const task =
    run.taskId === null
      ? undefined
      : yield* database.use((db) =>
          db.query.cloudTask.findFirst({
            where: and(eq(cloudTask.id, run.taskId!), eq(cloudTask.userId, ctx.userId)),
          }),
        );
  const zoned = DateTime.makeZoned(now, { timeZone: ctx.timeZone });
  const day = Option.isSome(zoned)
    ? DateTime.formatIsoDate(zoned.value)
    : now.toISOString().slice(0, 10);
  const clusterName = `Ruth Cloud · ${day} · ${task?.title ?? "Run"}`;
  const key = itemSourceKey(ctx.userId, fileId, name);
  const mimeType = outputMime(name);
  yield* storage.put(key, bytes, { contentType: mimeType });
  const title = input.title?.trim() || name;
  const folder = yield* database.useTransaction(async (tx) => {
    // A row lock makes first-publish cluster creation atomic across gateway requests/servers.
    const [current] = await tx
      .select()
      .from(cloudRun)
      .where(and(eq(cloudRun.id, runId), eq(cloudRun.userId, ctx.userId)))
      .for("update");
    if (!current) return undefined;
    const clusterId = current.clusterId ?? proposedClusterId;
    if (!current.clusterId) {
      await tx.insert(cluster).values({ id: clusterId, userId: ctx.userId, name: clusterName });
      await tx
        .update(cloudRun)
        .set({ clusterId })
        .where(and(eq(cloudRun.id, runId), eq(cloudRun.userId, ctx.userId)));
    }
    await tx.insert(item).values({
      id: fileId,
      userId: ctx.userId,
      title,
      kind: outputKind(mimeType),
      source: "ruth-cloud",
      placement: "filed",
      storageKey: key,
      mimeType,
      sizeBytes: bytes.byteLength,
      contentHash: hash,
      dedupeKey: `ruth-cloud:${runId}:${fileId}`,
      contentModifiedAt: now,
    });
    await tx.insert(itemCluster).values({ itemId: fileId, clusterId, userId: ctx.userId });
    const [folder] = await tx
      .select({ name: cluster.name })
      .from(cluster)
      .where(and(eq(cluster.id, clusterId), eq(cluster.userId, ctx.userId)));
    return folder?.name ?? clusterName;
  });
  if (folder === undefined)
    return yield* fail("publish_output", "This run was not found.", "not_found");
  yield* recordItemEvent(ctx.userId, fileId, "uploaded");
  yield* enqueueIngestion(ctx.userId, fileId);
  const cache = yield* SemanticCache;
  yield* cache.invalidate(ctx.userId);
  return { kind: "item" as const, fileId, drivePath: `${folder}/${title}` };
});
type CloudImpls = {
  [K in keyof typeof CLOUD_TOOL_SPECS]: ToolImpl<
    (typeof CLOUD_TOOL_SPECS)[K]["inputSchema"]["Type"],
    (typeof CLOUD_TOOL_SPECS)[K]["outputSchema"]["Type"],
    CloudToolServices
  >;
};
export const cloudTools: CloudImpls = {
  hydrate_files: (input, ctx) => hydrate(ctx, input, "agent"),
  publish_output: publishOutput,
  publish_report: Effect.fn("RuthCloud.publishReport")(function* (input, ctx) {
    const run = yield* ownedRun(ctx, "publish_report");
    const published: { sandboxPath: string; fileId: ItemId }[] = [];
    for (const path of input.artifacts ?? []) {
      const result = yield* publishOutput({ sandboxPath: path }, ctx);
      if (result.kind === "item") published.push({ sandboxPath: path, fileId: result.fileId });
    }
    const database = yield* Database;
    yield* database.use((db) =>
      db
        .update(cloudRun)
        .set({ summary: input.markdown })
        .where(and(eq(cloudRun.id, run.id), eq(cloudRun.userId, ctx.userId))),
    );
    return { published };
  }),
};
export const cloudGatewayTools = {
  hydrate_files: gatewayTool({
    spec: CLOUD_TOOL_SPECS.hydrate_files,
    policy: CLOUD_TOOL_POLICY.hydrate_files,
    execute: cloudTools.hydrate_files,
  }),
  publish_output: gatewayTool({
    spec: CLOUD_TOOL_SPECS.publish_output,
    policy: CLOUD_TOOL_POLICY.publish_output,
    execute: cloudTools.publish_output,
  }),
  publish_report: gatewayTool({
    spec: CLOUD_TOOL_SPECS.publish_report,
    policy: CLOUD_TOOL_POLICY.publish_report,
    execute: cloudTools.publish_report,
  }),
};
/** A taskless legacy run uses UTC. Ownership remains scoped to the verified token. */
export const resolveRunTimeZone = Effect.fn("RuthCloud.resolveRunTimeZone")(
  function* (run: VerifiedRunToken) {
    const database = yield* Database;
    const rows = yield* database.use((db) =>
      db
        .select({ timeZone: cloudTask.timeZone })
        .from(cloudRun)
        .leftJoin(
          cloudTask,
          and(eq(cloudRun.taskId, cloudTask.id), eq(cloudTask.userId, run.userId)),
        )
        .where(and(eq(cloudRun.id, run.runId), eq(cloudRun.userId, run.userId))),
    );
    return rows[0]?.timeZone ?? "UTC";
  },
  (effect) =>
    effect.pipe(
      Effect.catchTag("DatabaseError", (error) =>
        Effect.logWarning("Could not resolve Ruth Cloud time zone", error).pipe(Effect.as("UTC")),
      ),
    ),
);
