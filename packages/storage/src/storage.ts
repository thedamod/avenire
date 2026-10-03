import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Files } from "files-sdk";
import type { StorageKey } from "@avenire/contracts";

export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.String,
  key: Schema.optional(Schema.String),
  cause: Schema.Defect(),
}) {}

export class ObjectNotFound extends Schema.TaggedError<ObjectNotFound>()("ObjectNotFound", {
  key: Schema.String,
}) {}

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
      options?: { readonly contentType?: string },
    ) => Effect.Effect<void, StorageError>;
    readonly get: (key: StorageKey) => Effect.Effect<Uint8Array, StorageError | ObjectNotFound>;
    readonly head: (key: StorageKey) => Effect.Effect<StoredObject, StorageError | ObjectNotFound>;
    readonly remove: (key: StorageKey) => Effect.Effect<void, StorageError>;
    readonly list: (prefix: StorageKey) => Effect.Effect<ReadonlyArray<{ readonly key: StorageKey; readonly size: number }>, StorageError>;
    readonly signedDownloadUrl: (key: StorageKey, expiresInSeconds: number) => Effect.Effect<string, StorageError>;
    readonly signedUploadUrl: (
      key: StorageKey,
      options: SignedUploadOptions,
    ) => Effect.Effect<Awaited<ReturnType<Files["signedUploadUrl"]>>, StorageError>;
    readonly files: Files;
  }
>()("avenire/storage/Storage") {}

export const StorageConfig = Config.all({
  driver: Config.Literals(["fs", "r2", "s3"], "STORAGE_DRIVER").pipe(Config.withDefault("fs")),
  bucket: Config.String("STORAGE_BUCKET").pipe(Config.withDefault("avenire")),
  fsRoot: Config.String("STORAGE_FS_ROOT").pipe(Config.withDefault(".data/storage")),
  r2AccountId: Config.option(Config.String("R2_ACCOUNT_ID")),
  r2AccessKeyId: Config.option(Config.Redacted("R2_ACCESS_KEY_ID")),
  r2SecretAccessKey: Config.option(Config.Redacted("R2_SECRET_ACCESS_KEY")),
  awsRegion: Config.String("AWS_REGION").pipe(Config.withDefault("us-east-1")),
});

const attempt = <A>(operation: string, key: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new StorageError({ operation, key, cause }) });

const makeStorage = (files: Files): Storage["Service"] => {
  const ensureExists = (key: StorageKey) =>
    attempt("exists", key, () => files.exists(key)).pipe(
      Effect.filterOrFail(
        (exists) => exists,
        () => new ObjectNotFound({ key }),
      ),
    );

  return Storage.of({
    files,
    put: (key, body, options) => attempt("put", key, () => files.upload(key, body, options)).pipe(Effect.asVoid),
    get: (key) =>
      ensureExists(key).pipe(
        Effect.andThen(attempt("get", key, async () => new Uint8Array(await (await files.download(key)).arrayBuffer()))),
      ),
    head: (key) =>
      ensureExists(key).pipe(
        Effect.andThen(attempt("head", key, () => files.head(key))),
        Effect.map((file) => ({
          size: file.size,
          contentType: file.type,
          ...(file.etag === undefined ? {} : { etag: file.etag }),
        })),
      ),
    remove: (key) => attempt("remove", key, () => files.delete(key)).pipe(Effect.asVoid),
    list: (prefix) =>
      attempt("list", prefix, async () => {
        const objects: Array<{ readonly key: StorageKey; readonly size: number }> = [];
        for await (const file of files.listAll({ prefix })) {
          objects.push({ key: file.key as StorageKey, size: file.size });
        }
        return objects;
      }),
    signedDownloadUrl: (key, expiresInSeconds) =>
      attempt("signedDownloadUrl", key, () => files.url(key, { expiresIn: expiresInSeconds })),
    signedUploadUrl: (key, options) =>
      attempt("signedUploadUrl", key, () =>
        files.signedUploadUrl(key, { contentType: options.contentType, expiresIn: options.expiresInSeconds }),
      ),
  });
};

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const config = yield* StorageConfig;
    let adapter: ConstructorParameters<typeof Files>[0]["adapter"];
    if (config.driver === "fs") {
      const { fs } = yield* Effect.promise(() => import("files-sdk/fs"));
      adapter = fs({ root: config.fsRoot });
    } else if (config.driver === "r2") {
      const { r2 } = yield* Effect.promise(() => import("files-sdk/r2"));
      adapter = r2({
        bucket: config.bucket,
        ...(Option.isSome(config.r2AccountId) ? { accountId: config.r2AccountId.value } : {}),
        ...(Option.isSome(config.r2AccessKeyId)
          ? { accessKeyId: Redacted.value(config.r2AccessKeyId.value) }
          : {}),
        ...(Option.isSome(config.r2SecretAccessKey)
          ? { secretAccessKey: Redacted.value(config.r2SecretAccessKey.value) }
          : {}),
      });
    } else {
      const { s3 } = yield* Effect.promise(() => import("files-sdk/s3"));
      adapter = s3({ bucket: config.bucket, region: config.awsRegion });
    }
    return makeStorage(new Files({ adapter }));
  }),
);

export const StorageMemory = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const { memory } = yield* Effect.promise(() => import("files-sdk/memory"));
    return makeStorage(new Files({ adapter: memory() }));
  }),
);
