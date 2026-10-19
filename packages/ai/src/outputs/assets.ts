import {
  AssetId,
  CloudRunId,
  StorageKey,
  ThreadId,
  UserId,
  type Asset,
  type AssetKind,
  type AssetVisibility,
  type MessageId,
} from "@avenire/contracts";
import { Database, type DatabaseError } from "@avenire/database/client";
import { asset, type AssetRow } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { assetKey, newKeyVersion } from "@avenire/storage/keys";
import { Storage, type ObjectNotFound, type StorageError } from "@avenire/storage/storage";
import { and, desc, eq } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { posix } from "node:path";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Redacted from "effect/Redacted";

export const assetMediaType = (name: string): string => {
  const types: Readonly<Record<string, string>> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    pdf: "application/pdf",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
  };
  return types[posix.extname(name).slice(1).toLowerCase()] ?? "application/octet-stream";
};
export const assetKind = (mediaType: string): AssetKind =>
  mediaType.startsWith("image/")
    ? "image"
    : mediaType.startsWith("video/")
      ? "video"
      : mediaType === "application/pdf"
        ? "pdf"
        : "file";
export const safeAssetName = (name: string): string => {
  const cleaned = posix
    .basename(name.replaceAll("\\", "/"))
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/^\.+/, "")
    .trim();
  const extension = Array.from(posix.extname(cleaned)).slice(0, 20).join("");
  return (
    Array.from(cleaned.slice(0, cleaned.length - posix.extname(cleaned).length))
      .slice(0, 160 - Array.from(extension).length)
      .join("")
      .trim() + extension || "asset"
  );
};
/** Permanent token discloses only an id. Possessing it never bypasses authorizeAsset. */
export const signAssetToken = (id: AssetId, secret: string): string => {
  const payload = Buffer.from(id).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`asset:${payload}`).digest("base64url")}`;
};
export const verifyAssetToken = (token: string, secret: string): Option.Option<AssetId> => {
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((p) => !/^[\w-]+$/.test(p))) return Option.none();
  const [payload, signature] = parts as [string, string];
  const bytes = Buffer.from(payload, "base64url");
  const id = bytes.toString("utf8");
  const expected = createHmac("sha256", secret).update(`asset:${payload}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  return id &&
    Buffer.from(id).toString("base64url") === payload &&
    supplied.toString("base64url") === signature &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
    ? Option.some(AssetId.make(id))
    : Option.none();
};
export interface StoredAsset extends Asset {
  readonly userId: UserId;
  readonly storageKey: StorageKey;
  readonly visibility: AssetVisibility;
  readonly contentHash: string;
}
/** The single authorization hook: add an asset_share lookup here for link/people grants.
 * Permanent links must continue to call this hook; they are identifiers, not access grants.
 */
export const authorizeAsset = (
  asset: Pick<StoredAsset, "userId" | "visibility">,
  viewer: UserId,
): boolean => asset.userId === viewer;
export interface AssetFilters {
  readonly threadId?: ThreadId;
  readonly runId?: CloudRunId;
}
export interface PutAsset extends AssetFilters {
  readonly name: string;
  readonly title?: string;
  readonly bytes:
    | Uint8Array
    | {
        readonly stream: ReadableStream<Uint8Array>;
        readonly sizeBytes: number;
        readonly contentHash: string;
      };
  readonly idempotencyId?: AssetId;
  readonly mediaType: string;
  readonly kind?: AssetKind;
  readonly messageId?: MessageId;
}
type AssetError = StorageError | DatabaseError | PlatformError.PlatformError;
export class AssetStore extends Context.Service<
  AssetStore,
  {
    readonly put: (
      userId: UserId,
      input: PutAsset,
    ) => Effect.Effect<StoredAsset, AssetError, Crypto.Crypto>;
    readonly get: (id: AssetId) => Effect.Effect<Option.Option<StoredAsset>, DatabaseError>;
    readonly list: (
      userId: UserId,
      filters?: AssetFilters,
    ) => Effect.Effect<ReadonlyArray<Asset>, DatabaseError>;
    readonly url: (asset: Pick<Asset, "id">) => string;
    readonly resolve: (token: string) => Option.Option<AssetId>;
    readonly load: (asset: StoredAsset) => Effect.Effect<Uint8Array, StorageError | ObjectNotFound>;
  }
>()("avenire/ai/AssetStore") {}
export interface AssetRepository {
  readonly insert: (row: AssetRow) => Effect.Effect<void, DatabaseError>;
  readonly get: (id: AssetId) => Effect.Effect<AssetRow | undefined, DatabaseError>;
  readonly list: (
    userId: UserId,
    filters: AssetFilters,
  ) => Effect.Effect<ReadonlyArray<AssetRow>, DatabaseError>;
}
export const publicAsset = (entry: StoredAsset): Asset => ({
  id: entry.id,
  kind: entry.kind,
  title: entry.title,
  mediaType: entry.mediaType,
  sizeBytes: entry.sizeBytes,
  createdAt: entry.createdAt,
  url: entry.url,
  ...(entry.threadId === undefined ? {} : { threadId: entry.threadId }),
  ...(entry.runId === undefined ? {} : { runId: entry.runId }),
});
export const makeAssetStore = Effect.fn("AssetStore.make")(function* (options: {
  readonly appUrl: string;
  readonly secret: Redacted.Redacted<string>;
  readonly repository: AssetRepository;
}) {
  const storage = yield* Storage;
  const url = (entry: Pick<Asset, "id">) =>
    `${options.appUrl.replace(/\/$/, "")}/a/${signAssetToken(entry.id, Redacted.value(options.secret))}`;
  const wire = (row: AssetRow): StoredAsset => ({
    id: AssetId.make(row.id),
    userId: UserId.make(row.userId),
    kind: row.kind,
    title: row.title,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    storageKey: StorageKey.make(row.storageKey),
    contentHash: row.contentHash,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    url: url({ id: AssetId.make(row.id) }),
    ...(row.threadId === null ? {} : { threadId: ThreadId.make(row.threadId) }),
    ...(row.runId === null ? {} : { runId: CloudRunId.make(row.runId) }),
  });
  return AssetStore.of({
    url,
    resolve: (token) => verifyAssetToken(token, Redacted.value(options.secret)),
    get: Effect.fn("AssetStore.get")((id) =>
      options.repository
        .get(id)
        .pipe(Effect.map((row) => (row ? Option.some(wire(row)) : Option.none()))),
    ),
    list: Effect.fn("AssetStore.list")((userId, filters = {}) =>
      options.repository
        .list(userId, filters)
        .pipe(Effect.map((rows) => rows.map((row) => publicAsset(wire(row))))),
    ),
    load: Effect.fn("AssetStore.load")((entry) => storage.get(entry.storageKey)),
    put: Effect.fn("AssetStore.put")(function* (userId, input) {
      const id = input.idempotencyId ?? (yield* newId(AssetId));
      const existing = yield* options.repository.get(id);
      if (existing && existing.userId === userId) return wire(existing);
      const now = yield* DateTime.now;
      // A retried idempotent put reuses the id but never the key: a failed or crashed write may
      // have left (or deleted) an object under the old one, and storage keys are write-once.
      const key = assetKey(userId, yield* newKeyVersion, safeAssetName(input.name));
      const row: AssetRow = {
        id,
        userId,
        kind: input.kind ?? assetKind(input.mediaType),
        title: input.title?.trim() || safeAssetName(input.name),
        mediaType: input.mediaType,
        storageKey: key,
        sizeBytes:
          input.bytes instanceof Uint8Array ? input.bytes.byteLength : input.bytes.sizeBytes,
        contentHash:
          input.bytes instanceof Uint8Array
            ? createHash("sha256").update(input.bytes).digest("hex")
            : input.bytes.contentHash,
        threadId: input.threadId ?? null,
        messageId: input.messageId ?? null,
        runId: input.runId ?? null,
        visibility: "private",
        createdAt: DateTime.toDateUtc(now),
      };
      yield* storage.put(
        key,
        input.bytes instanceof Uint8Array ? input.bytes : input.bytes.stream,
        { contentType: input.mediaType },
      );
      yield* options.repository
        .insert(row)
        .pipe(
          Effect.onError(() =>
            storage
              .remove(key)
              .pipe(
                Effect.catchCause((cause) =>
                  Effect.logWarning("Could not remove unpersisted asset", cause),
                ),
              ),
          ),
        );
      return wire(row);
    }),
  });
});
export const AssetStoreLive = Layer.effect(
  AssetStore,
  Effect.gen(function* () {
    const appUrl = yield* Config.String("APP_URL");
    const dedicated = yield* Config.option(Config.Redacted("ASSET_SIGNING_SECRET"));
    const secret =
      Option.isSome(dedicated) && Redacted.value(dedicated.value).length > 0
        ? dedicated.value
        : yield* Config.Redacted("WIDGET_SIGNING_SECRET");
    const database = yield* Database;
    return yield* makeAssetStore({ appUrl, secret, repository: assetRepository(database) });
  }),
);

export const assetRepository = (database: Database["Service"]): AssetRepository => ({
  insert: (row) => database.use((db) => db.insert(asset).values(row)).pipe(Effect.asVoid),
  get: (id) => database.use((db) => db.query.asset.findFirst({ where: eq(asset.id, id) })),
  list: (userId, filters) =>
    database.use((db) =>
      db.query.asset.findMany({
        where: and(
          eq(asset.userId, userId),
          ...(filters.threadId ? [eq(asset.threadId, filters.threadId)] : []),
          ...(filters.runId ? [eq(asset.runId, filters.runId)] : []),
        ),
        orderBy: [desc(asset.createdAt), desc(asset.id)],
      }),
    ),
});
