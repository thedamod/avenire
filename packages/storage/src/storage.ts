import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { Files, FilesError, type MultipartOptions } from "files-sdk";
import type { UploadThingAdapter } from "files-sdk/uploadthing";
import { createHash } from "node:crypto";

import { StorageKey } from "@avenire/contracts";

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.String,
  key: Schema.optional(Schema.String),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const target = this.key === undefined ? "" : ` ${this.key}`;
    return `Storage ${this.operation}${target} failed`;
  }
}

export class ObjectNotFound extends Schema.TaggedError<ObjectNotFound>()("ObjectNotFound", {
  key: Schema.String,
}) {
  override get message(): string {
    return `Object ${this.key} does not exist`;
  }
}

export type StoredObject = {
  readonly size: number;
  readonly contentType: string;
  readonly etag?: string;
};

export type SignedUploadOptions = {
  readonly contentType: string;
  readonly expiresInSeconds: number;
};

export class Storage extends Context.Service<
  Storage,
  {
    readonly put: (
      key: StorageKey,
      body: Uint8Array | ReadableStream<Uint8Array> | Blob | string,
      options?: { readonly contentType?: string; readonly multipart?: boolean | MultipartOptions },
    ) => Effect.Effect<void, StorageError>;
    readonly get: (key: StorageKey) => Effect.Effect<Uint8Array, StorageError | ObjectNotFound>;
    readonly head: (key: StorageKey) => Effect.Effect<StoredObject, StorageError | ObjectNotFound>;
    readonly remove: (key: StorageKey) => Effect.Effect<void, StorageError>;
    readonly list: (
      prefix: StorageKey,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly key: StorageKey; readonly size: number }>,
      StorageError
    >;
    readonly signedDownloadUrl: (
      key: StorageKey,
      expiresInSeconds: number,
    ) => Effect.Effect<string, StorageError>;
    readonly signedUploadUrl: (
      key: StorageKey,
      options: SignedUploadOptions,
    ) => Effect.Effect<Awaited<ReturnType<Files["signedUploadUrl"]>>, StorageError>;
    /** Size-bound provider capability. Undefined means this driver uses the app PUT route. */
    readonly prepareSourceUpload?: (
      key: StorageKey,
      options: { contentType: string; sizeBytes: number; expiresInSeconds: number },
    ) => Effect.Effect<{ url: string; key: string }, StorageError>;
    readonly stream?: (
      key: StorageKey,
    ) => Effect.Effect<ReadableStream<Uint8Array>, StorageError | ObjectNotFound>;
    readonly files: Files;
  }
>()("avenire/storage/Storage") {}

export const StorageConfig = Config.all({
  driver: Config.Literals(["fs", "r2", "s3", "uploadthing"], "STORAGE_DRIVER").pipe(
    Config.withDefault("fs"),
  ),
  bucket: Config.String("STORAGE_BUCKET").pipe(Config.withDefault("avenire")),
  fsRoot: Config.String("STORAGE_FS_ROOT").pipe(Config.withDefault(".data/storage")),
  r2AccountId: Config.option(Config.String("R2_ACCOUNT_ID")),
  r2AccessKeyId: Config.option(Config.Redacted("R2_ACCESS_KEY_ID")),
  r2SecretAccessKey: Config.option(Config.Redacted("R2_SECRET_ACCESS_KEY")),
  awsRegion: Config.String("AWS_REGION").pipe(Config.withDefault("us-east-1")),
  uploadthingToken: Config.option(Config.Redacted("UPLOADTHING_TOKEN")),
  // UploadThing's free tier rejects private files; public-read files get a permanent CDN URL.
  uploadthingAcl: Config.Literals(["private", "public-read"], "UPLOADTHING_ACL").pipe(
    Config.withDefault("private"),
  ),
});

type FilesAdapter = ConstructorParameters<typeof Files>[0]["adapter"];

/** Wrap a files-sdk call in a span, attributing failures to `operation` and `key`. */
const attempt = <A>(operation: string, key: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new StorageError({ operation, key, cause }),
  }).pipe(Effect.withSpan(`Storage.${operation}`, { attributes: { key } }));

/** files-sdk reports a missing object as an error with `code: "NotFound"`. */
const isNotFound = (error: StorageError) =>
  (error.cause as { code?: unknown } | undefined)?.code === "NotFound";

/** Reads, lists, signed URLs and deletes are idempotent: retry transient provider failures. */
const idempotent = <A>(effect: Effect.Effect<A, StorageError>) =>
  effect.pipe(
    Effect.retry({
      times: 2,
      schedule: Schedule.exponential("300 millis"),
      while: (error) => !isNotFound(error),
    }),
  );

/** `{ name, message, code }` down the cause chain; Error objects otherwise log as `{}`. */
const describeCause = (cause: unknown) => {
  const chain: Array<{ name: string | undefined; message: string | undefined; code: unknown }> = [];
  for (let current = cause, depth = 0; current && depth < 5; depth += 1) {
    const error = current as {
      name?: string;
      _tag?: string;
      message?: string;
      code?: unknown;
      cause?: unknown;
    };
    chain.push({
      name: error._tag ?? error.name,
      message: error.message?.slice(0, 300),
      code: error.code,
    });
    current = error.cause;
  }
  return chain;
};

const readAll = async (files: Files, prefix: StorageKey) => {
  const objects: Array<{ readonly key: StorageKey; readonly size: number }> = [];
  for await (const file of files.listAll({ prefix })) {
    objects.push({ key: StorageKey.make(file.key), size: file.size });
  }
  return objects;
};

const notFound =
  (key: StorageKey) =>
  <A>(effect: Effect.Effect<A, StorageError>): Effect.Effect<A, StorageError | ObjectNotFound> =>
    effect.pipe(Effect.catchIf(isNotFound, () => Effect.fail(new ObjectNotFound({ key }))));

const makeStorage = (files: Files): Storage["Service"] =>
  Storage.of({
    files,
    stream: (key) =>
      idempotent(
        attempt("stream", key, async () => (await files.download(key, { as: "stream" })).stream()),
      ).pipe(notFound(key)),
    put: (key, body, options) => {
      const upload = attempt("put", key, () => files.upload(key, body, options)).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("Storage put failed", { key, cause: describeCause(error.cause) }),
        ),
      );
      // A stream can't be replayed; bytes, strings and (file-backed) Blobs can, so a transient
      // provider or network failure retries instead of failing the whole upload.
      return (body instanceof ReadableStream ? upload : idempotent(upload)).pipe(Effect.asVoid);
    },
    get: (key) =>
      idempotent(
        attempt("get", key, async () => {
          const file = await files.download(key);
          return new Uint8Array(await file.arrayBuffer());
        }),
      ).pipe(notFound(key)),
    head: (key) =>
      idempotent(attempt("head", key, () => files.head(key))).pipe(
        notFound(key),
        Effect.map((file) => ({
          size: file.size,
          contentType: file.type,
          ...(file.etag === undefined ? {} : { etag: file.etag }),
        })),
      ),
    remove: (key) =>
      idempotent(attempt("remove", key, () => files.delete(key))).pipe(Effect.asVoid),
    list: (prefix) => idempotent(attempt("list", prefix, () => readAll(files, prefix))),
    signedDownloadUrl: (key, expiresInSeconds) =>
      idempotent(
        attempt("signedDownloadUrl", key, () => files.url(key, { expiresIn: expiresInSeconds })),
      ),
    signedUploadUrl: (key, options) =>
      attempt("signedUploadUrl", key, () =>
        files.signedUploadUrl(key, {
          contentType: options.contentType,
          expiresIn: options.expiresInSeconds,
        }),
      ),
  });

type StorageConfig = Config.Success<typeof StorageConfig>;

const r2Credentials = (config: StorageConfig) => ({
  ...Option.match(config.r2AccountId, {
    onNone: () => ({}),
    onSome: (accountId) => ({ accountId }),
  }),
  ...Option.match(config.r2AccessKeyId, {
    onNone: () => ({}),
    onSome: (accessKeyId) => ({ accessKeyId: Redacted.value(accessKeyId) }),
  }),
  ...Option.match(config.r2SecretAccessKey, {
    onNone: () => ({}),
    onSome: (secretAccessKey) => ({ secretAccessKey: Redacted.value(secretAccessKey) }),
  }),
});

/** UploadThing stores our key as the file's customId, which is capped at 128 characters. */
export const UPLOADTHING_MAX_KEY = 128;
const URL_SAFE = /^[\w.-]*$/;
const shortHash = (text: string) => createHash("sha256").update(text).digest("hex");
/** Keep the directory (prefix listings and purges depend on it) and make the file name a valid
 * customId: the CDN 404s on names with spaces or punctuation, so those become a slug plus a
 * hash of the original; an over-long name becomes a hash. Fitting a fitted key is a no-op. */
export const fitKey = (key: string, max = UPLOADTHING_MAX_KEY): string => {
  const slash = key.lastIndexOf("/");
  const dir = key.slice(0, slash + 1);
  let name = key.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const ext =
    dot > 0 && name.length - dot <= 10 && URL_SAFE.test(name.slice(dot)) ? name.slice(dot) : "";
  if (!URL_SAFE.test(name)) {
    const stem = name.slice(0, name.length - ext.length).replace(/[^\w.-]+/g, "-");
    name = `${stem}-${shortHash(name).slice(0, 8)}${ext}`;
  }
  if (dir.length + name.length <= max) return `${dir}${name}`;
  const room = max - dir.length - ext.length;
  if (room < 16) throw new RangeError(`Storage key directory is too long for UploadThing: ${dir}`);
  return `${dir}${shortHash(name).slice(0, Math.min(room, 32))}${ext}`;
};
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** UploadThing behaviour for every caller, including `storage.files`. Keys are write-once:
 * looking up a customId that doesn't exist yet (API or CDN) makes the next upload to it fail
 * with 409, and a deleted customId can't be reused, so callers write new keys instead of
 * overwriting (see the review accept and document cache). Here:
 * - keys are fitted to the 128-character customId limit;
 * - reads resolve customIds to file keys: the CDN 404s on our slash-containing customIds;
 * - `download`/`head` retry a brief NotFound while the CDN catches up after an upload;
 * - `url` drops the content-disposition override, which UploadThing cannot set. */
const forUploadThing = (adapter: UploadThingAdapter): FilesAdapter => {
  // Only cache successful resolutions. Keys are write-once; missing uploads must be retried.
  const readKeys = new Map<string, string>();
  const readKey = async (key: string) => {
    const customId = fitKey(key);
    const cached = readKeys.get(customId);
    if (cached) return cached;
    const { data } = await adapter.raw.getFileUrls(customId, { keyType: "customId" });
    const resolved = data[0]?.key;
    if (!resolved) throw new FilesError("NotFound", "UploadThing object does not exist");
    if (readKeys.size >= 256) readKeys.delete(readKeys.keys().next().value!);
    readKeys.set(customId, resolved);
    return resolved;
  };
  return new Proxy(adapter, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || property === "list" || property === "listAll")
        return value;
      const call = (first: unknown, rest: unknown[]) =>
        value.call(
          target,
          typeof first === "string"
            ? fitKey(first)
            : Array.isArray(first)
              ? first.map((key) => (typeof key === "string" ? fitKey(key) : key))
              : first,
          ...rest,
        );
      if (property === "download" || property === "head")
        return async (key: string, ...rest: unknown[]) => {
          for (let attempt = 1; ; attempt++) {
            try {
              const file = await value.call(target, await readKey(key), ...rest);
              return { ...file, key: fitKey(key), name: fitKey(key) };
            } catch (error) {
              if ((error as { code?: unknown }).code !== "NotFound" || attempt === 4) throw error;
              await pause(500 * attempt);
            }
          }
        };
      if (property === "url")
        return async (key: string, options?: { responseContentDisposition?: string }) => {
          const { responseContentDisposition: _ignored, ...rest } = options ?? {};
          return value.call(target, await readKey(key), rest);
        };
      if (property === "exists")
        return async (key: string, ...rest: unknown[]) => {
          try {
            return await value.call(target, await readKey(key), ...rest);
          } catch (error) {
            if ((error as { code?: unknown }).code === "NotFound") return false;
            throw error;
          }
        };
      return (first: unknown, ...rest: unknown[]) => call(first, rest);
    },
  });
};

// Drivers are imported lazily so a deployment only loads the SDK it actually uses.
const makeAdapter = (config: StorageConfig): Effect.Effect<FilesAdapter> => {
  switch (config.driver) {
    case "fs":
      return Effect.promise(() => import("files-sdk/fs")).pipe(
        Effect.map(({ fs }) => fs({ root: config.fsRoot })),
      );
    case "r2":
      return Effect.promise(() => import("files-sdk/r2")).pipe(
        Effect.map(({ r2 }) => r2({ bucket: config.bucket, ...r2Credentials(config) })),
      );
    case "s3":
      return Effect.promise(() => import("files-sdk/s3")).pipe(
        Effect.map(({ s3 }) => s3({ bucket: config.bucket, region: config.awsRegion })),
      );
    case "uploadthing":
      // Private (default): every read goes through a short-lived signed URL (our /a/ links mint them).
      return Effect.promise(() => import("files-sdk/uploadthing")).pipe(
        Effect.map(({ uploadthing }) =>
          forUploadThing(
            uploadthing({
              acl: config.uploadthingAcl,
              ...Option.match(config.uploadthingToken, {
                onNone: () => ({}),
                onSome: (token) => ({ token: Redacted.value(token) }),
              }),
            }),
          ),
        ),
      );
  }
};

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const config = yield* StorageConfig;
    const adapter = yield* makeAdapter(config);
    const service = makeStorage(new Files({ adapter }));
    if (config.driver !== "uploadthing" || Option.isNone(config.uploadthingToken)) return service;
    const { prepareUploadThingSource } = yield* Effect.promise(() => import("./source-upload.ts"));
    const token = Redacted.value(config.uploadthingToken.value);
    return {
      ...service,
      prepareSourceUpload: (key, options) =>
        attempt("prepareSourceUpload", key, () =>
          prepareUploadThingSource(token, fitKey(key), options, config.uploadthingAcl),
        ),
    };
  }),
);

export const StorageMemory = Layer.effect(
  Storage,
  Effect.promise(() => import("files-sdk/memory")).pipe(
    Effect.map(({ memory }) => makeStorage(new Files({ adapter: memory() }))),
  ),
);
