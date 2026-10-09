import { ArtifactId, StorageKey, UserId } from "@avenire/contracts";
import { Database, type DatabaseError } from "@avenire/database/client";
import { user } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { userPrefix } from "@avenire/storage/keys";
import { Storage, type ObjectNotFound, type StorageError } from "@avenire/storage/storage";
import { asc, gt } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { posix } from "node:path";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USER_BATCH_SIZE = 200;
export const artifactMediaType = (name: string): string => {
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
  const extension = posix.extname(name).slice(1).toLowerCase();
  return Object.hasOwn(types, extension) ? types[extension]! : "application/octet-stream";
};
export const safeArtifactName = (name: string): string => {
  const cleaned = posix
    .basename(name.replaceAll("\\", "/"))
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "artifact";
  // Keep the extension for media-type inference, and never split a Unicode code point.
  const extension = posix.extname(cleaned);
  const suffix = Array.from(extension).slice(0, 20).join("");
  const stem = cleaned.slice(0, cleaned.length - extension.length);
  return (
    Array.from(stem)
      .slice(0, 160 - Array.from(suffix).length)
      .join("")
      .trim() + suffix || "artifact"
  );
};
export const artifactPrefix = (userId: UserId): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}.avenire/tmp/artifacts/`);
export const artifactKey = (
  userId: UserId,
  artifactId: ArtifactId,
  expiresAt: string,
  name: string,
): StorageKey =>
  StorageKey.make(
    `${artifactPrefix(userId)}${expiresAt.slice(0, 10)}/${artifactId}/${safeArtifactName(name)}`,
  );
export interface ResolvedArtifact {
  readonly key: StorageKey;
  readonly expiresAt: string;
  readonly name: string;
}
export class ArtifactStore extends Context.Service<
  ArtifactStore,
  {
    readonly put: (
      userId: UserId,
      input: { readonly name: string; readonly bytes: Uint8Array; readonly mediaType: string },
    ) => Effect.Effect<
      { artifactId: ArtifactId; key: StorageKey; url: string; expiresAt: string },
      StorageError | PlatformError.PlatformError,
      Crypto.Crypto
    >;
    readonly resolve: (token: string) => Effect.Effect<Option.Option<ResolvedArtifact>>;
    readonly load: (key: StorageKey) => Effect.Effect<Uint8Array, StorageError | ObjectNotFound>;
    readonly sweepExpired: Effect.Effect<number, StorageError | DatabaseError>;
  }
>()("avenire/ruth-kit/ArtifactStore") {}

/** User enumeration is injected so cleanup can be tested without a live database. */
export const makeArtifactStore = Effect.fn("ArtifactStore.make")(function* (options: {
  readonly appUrl: string;
  readonly secret: Redacted.Redacted<string>;
  readonly listUserIds: (after?: string) => Effect.Effect<ReadonlyArray<UserId>, DatabaseError>;
}) {
  const storage = yield* Storage;
  const sign = (payload: string) =>
    createHmac("sha256", Redacted.value(options.secret)).update(payload).digest();
  const Payload = Schema.Struct({
    userId: Schema.String,
    key: Schema.String,
    expiresAt: Schema.String,
  });
  const decode = Schema.decodeUnknownOption(Payload);
  return ArtifactStore.of({
    put: Effect.fn("ArtifactStore.put")(function* (userId, input) {
      const id = yield* newId(ArtifactId);
      const now = yield* DateTime.now;
      const expiresAt = DateTime.formatIso(DateTime.add(now, { milliseconds: TTL_MS }));
      const key = artifactKey(userId, id, expiresAt, input.name);
      yield* storage.put(key, input.bytes, { contentType: input.mediaType });
      const payload = Buffer.from(JSON.stringify({ userId, key, expiresAt })).toString("base64url");
      const token = `${payload}.${sign(payload).toString("base64url")}`;
      return {
        artifactId: id,
        key,
        url: `${options.appUrl.replace(/\/$/, "")}/api/ruth/artifacts/${token}`,
        expiresAt,
      };
    }),
    resolve: Effect.fn("ArtifactStore.resolve")(function* (token) {
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.sync(() => {
        const parts = token.split(".");
        if (parts.length !== 2) return Option.none<ResolvedArtifact>();
        const [payload, signature] = parts as [string, string];
        if (!/^[\w-]+$/.test(payload) || !/^[\w-]+$/.test(signature))
          return Option.none<ResolvedArtifact>();
        const supplied = Buffer.from(signature, "base64url");
        const expected = sign(payload);
        if (
          supplied.length !== expected.length ||
          supplied.toString("base64url") !== signature ||
          !timingSafeEqual(supplied, expected)
        )
          return Option.none<ResolvedArtifact>();
        try {
          const bytes = Buffer.from(payload, "base64url");
          if (bytes.toString("base64url") !== payload) return Option.none<ResolvedArtifact>();
          const result = decode(JSON.parse(bytes.toString("utf8")));
          if (Option.isNone(result)) return Option.none<ResolvedArtifact>();
          const { userId, key, expiresAt } = result.value;
          const expires = Date.parse(expiresAt);
          const prefix = `${userPrefix(UserId.make(userId))}.avenire/tmp/artifacts/${expiresAt.slice(0, 10)}/`;
          const relative = key.slice(prefix.length).split("/");
          if (
            !Number.isFinite(expires) ||
            expires <= now ||
            !key.startsWith(prefix) ||
            relative.length !== 2 ||
            !relative[0] ||
            relative[1] !== safeArtifactName(relative[1] ?? "")
          )
            return Option.none<ResolvedArtifact>();
          return Option.some({ key: StorageKey.make(key), expiresAt, name: relative[1]! });
        } catch {
          // Malformed capability input is an ordinary miss, never a route defect.
          return Option.none<ResolvedArtifact>();
        }
      });
    }),
    load: Effect.fn("ArtifactStore.load")((key) => storage.get(key)),
    sweepExpired: Effect.gen(function* () {
      const today = DateTime.formatIsoDateUtc(yield* DateTime.now);
      let after: string | undefined;
      let removed = 0;
      while (true) {
        const users = yield* options.listUserIds(after);
        if (users.length === 0) break;
        for (const userId of users) {
          const prefix = artifactPrefix(userId);
          const objects = yield* storage.list(prefix);
          for (const object of objects) {
            const relative = object.key.slice(prefix.length);
            const date = relative.split("/")[0]!;
            if (
              object.key.startsWith(prefix) &&
              /^\d{4}-\d{2}-\d{2}$/.test(date) &&
              date < today &&
              relative.includes("/")
            ) {
              yield* storage.remove(object.key);
              removed++;
            }
          }
        }
        after = users.at(-1);
      }
      return removed;
    }).pipe(Effect.withSpan("ArtifactStore.sweepExpired")),
  });
});

export const ArtifactStoreLive = Layer.effect(
  ArtifactStore,
  Effect.gen(function* () {
    const appUrl = yield* Config.String("APP_URL");
    const dedicated = yield* Config.option(Config.Redacted("ARTIFACT_SIGNING_SECRET"));
    const secret =
      Option.isSome(dedicated) && Redacted.value(dedicated.value).length > 0
        ? dedicated.value
        : yield* Config.Redacted("WIDGET_SIGNING_SECRET");
    const database = yield* Database;
    return yield* makeArtifactStore({
      appUrl,
      secret,
      listUserIds: (after) =>
        database
          .use((db) =>
            db
              .select({ id: user.id })
              .from(user)
              .where(after === undefined ? undefined : gt(user.id, after))
              .orderBy(asc(user.id))
              .limit(USER_BATCH_SIZE),
          )
          .pipe(Effect.map((rows) => rows.map((row) => UserId.make(row.id)))),
    });
  }),
);
export const ArtifactSweeperLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* ArtifactStore;
    yield* Effect.repeat(
      store.sweepExpired.pipe(
        Effect.catchCause((cause) => Effect.logWarning("Artifact sweep failed", cause)),
      ),
      Schedule.spaced("1 day"),
    ).pipe(Effect.forkScoped);
  }),
);
