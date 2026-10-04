# Effect 4.0 conventions

We use `effect@4.0.0` (stable). Modules that were under `effect/unstable/*` in the release
candidates are now top-level: `effect/rpc/*`, `effect/http/*`, `effect/sql/*`,
`effect/observability/*`. Import modules by namespace from their own path:

```ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
```

Model calls, tools and chat streaming use the AI SDK, not `effect/ai` (see the rule in `AGENTS.md`).

## Services

```ts
export class Storage extends Context.Service<
  Storage,
  {
    readonly put: (key: StorageKey, body: Uint8Array) => Effect.Effect<void, StorageError>;
  }
>()("avenire/storage/Storage") {}

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const config = yield* StorageConfig;
    return Storage.of({ put: Effect.fn("Storage.put")(function* (key, body) { ... }) });
  }),
);
```

- Identifier format: `"avenire/<package>/<Service>"`.
- Access a service inside a generator with `yield* Storage`. Outside generators use
  `Effect.service(Storage)` (there is no `.asEffect()`).
- Resources: `Effect.acquireRelease` inside `Layer.effect`; the layer's scope owns them.
- Name operations with `Effect.fn("Service.method")(function* (...) { ... })`, which
  also creates a tracing span.

## Errors

```ts
export class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}
```

Wrap promise APIs with `Effect.tryPromise({ try, catch: (cause) => new StorageError({ ... }) })`.
Recover with `Effect.catchTag` / `Effect.catchTags`. Unexpected failures are defects.

## Config

`Config.String("NAME")`, `Config.Redacted("NAME")`, `Config.Int`, `Config.Boolean`,
`Config.option(...)`, `Config.withDefault(...)`, `Config.all({...})`. Note the capitalized
constructors. Config is read inside layers, never at module top level.

## Ids and time

- Ids: `newId(ItemId)` from `@avenire/shared/id` (UUIDv7 via the `Crypto` service).
- Time: `DateTime.now` / `Clock`, not `new Date()` inside Effect code.

## RPC

Contracts declare groups in `@avenire/contracts` (`LibraryRpcs`, `SearchRpcs`, `RuthRpcs`,
`CloudRpcs`). The server implements them with `Group.toLayer({ "library.listItems": (payload) => ... })`
and reads the user with `yield* CurrentUser`.

## Tests

Colocated `*.test.ts` with `@effect/vitest`: `it.effect("...", () => Effect.gen(function* () { ... }))`
and `layer(TestLayer)("suite", (it) => { ... })`. Do not call `Effect.runPromise` in tests.
