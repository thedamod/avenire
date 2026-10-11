import { type AssetRow } from "@avenire/database/schema";
import { StorageMemory } from "@avenire/storage/storage";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { AssetStore, makeAssetStore, type AssetRepository } from "./assets.ts";
export const assetSettings = {
  appUrl: "https://app.test",
  secret: Redacted.make("asset-test-secret"),
};
export const memoryAssetRepository = (): AssetRepository => {
  const rows = new Map<string, AssetRow>();
  return {
    insert: (row) =>
      Effect.sync(() => {
        rows.set(row.id, row);
      }),
    get: (id) => Effect.sync(() => rows.get(id)),
    list: (userId, filters) =>
      Effect.sync(() =>
        [...rows.values()].filter(
          (row) =>
            row.userId === userId &&
            (!filters.threadId || row.threadId === filters.threadId) &&
            (!filters.runId || row.runId === filters.runId),
        ),
      ),
  };
};
export const AssetStoreTest = Layer.effect(
  AssetStore,
  Effect.suspend(() => makeAssetStore({ ...assetSettings, repository: memoryAssetRepository() })),
).pipe(Layer.provideMerge(StorageMemory));
