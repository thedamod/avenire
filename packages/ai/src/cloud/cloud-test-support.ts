import {
  AssetStore,
  makeAssetStore,
  assetRepository,
  signAssetToken,
  verifyAssetToken,
} from "../outputs/assets.ts";
import { assetSettings } from "../outputs/asset-test-support.ts";
import * as Redacted from "effect/Redacted";
/** Recording database and sandbox doubles; real StorageMemory exercises object semantics. */
import { CloudRunId, FileId, WORKSPACE_CAP_BYTES } from "@avenire/contracts";
import { CLOUD_WORKSPACE, CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import { SandboxInputRejected } from "@avenire/cloud/daytona";
import { Database } from "@avenire/database/client";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { Storage } from "@avenire/storage/storage";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@avenire/database/schema";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ctx, fakeDatabase, testCrypto } from "../tools/test-support.ts";
import type { AgentContext } from "../tools/core.ts";
import type { MetadataCandidate } from "../tools/selectors.ts";

type Row = Record<string, unknown>;
export const cloudCtx: AgentContext = {
  ...ctx,
  agent: "ruth-cloud",
  runId: CloudRunId.make("run"),
  timeZone: "America/Los_Angeles",
};
export const fileId = FileId.make("12345678-file");
export const candidate = (
  id = fileId,
  overrides: Partial<MetadataCandidate> = {},
): MetadataCandidate => ({
  fileId: id,
  title: "Lecture",
  kind: "pdf",
  mimeType: "application/pdf",
  size: 5,
  source: "upload",
  tags: [],
  createdAt: "2026-10-01T00:00:00Z",
  contentModifiedAt: "2026-10-02T00:00:00Z",
  folderName: "Physics",
  activityAt: "2026-10-02T00:00:00Z",
  events: [],
  ...overrides,
});
export const cloudFixture = () => {
  const tables = new Map<string, Row[]>();
  const rows = (table: string) => {
    let result = tables.get(table);
    if (!result) {
      result = [];
      tables.set(table, result);
    }
    return result;
  };
  const metadata: MetadataCandidate[] = [candidate()];
  rows("file").push({
    id: fileId,
    userId: ctx.userId,
    title: "Lecture",
    kind: "pdf",
    mimeType: "application/pdf",
    storageKey: "original",
    contentHash: "base",
    contentModifiedAt: new Date("2026-10-02"),
    sizeBytes: 5,
  });
  rows("cloud_run").push({ id: "run", userId: ctx.userId, taskId: "task", folderId: null });
  rows("cloud_task").push({
    id: "task",
    userId: ctx.userId,
    title: "Morning",
    timeZone: "America/Los_Angeles",
  });
  const writes: { table: string; values: Row }[] = [];
  const statements: { sql: string; params: unknown[] }[] = [];
  const dialect = new PgDialect();
  const camel = (value: string) =>
    value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const matches = (row: Row, where?: SQL) => {
    if (!where) return true;
    const query = dialect.sqlToQuery(where);
    for (const match of query.sql.matchAll(/"\w+"\."(\w+)" = \$(\d+)/g))
      if (row[camel(match[1]!)] !== query.params[Number(match[2]) - 1]) return false;
    const inMatch = /"\w+"\."(\w+)" in \(([^)]+)\)/i.exec(query.sql);
    if (inMatch) {
      const values = [...inMatch[2]!.matchAll(/\$(\d+)/g)].map(
        (match) => query.params[Number(match[1]) - 1],
      );
      if (!values.includes(row[camel(inMatch[1]!)])) return false;
    }
    return true;
  };
  const query = Object.fromEntries(
    [
      "file",
      "cloudRun",
      "cloudHydration",
      "user",
      "asset",
      "cloudTask",
      "cloudWorkspaceFile",
      "pendingApproval",
    ].map((name) => {
      const table = name.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
      return [
        name,
        {
          findFirst: async ({ where }: { where?: SQL } = {}) =>
            rows(table).find((row) => matches(row, where)),
          findMany: async ({ where }: { where?: SQL } = {}) =>
            rows(table)
              .filter((row) => matches(row, where))
              .map((row) => ({ ...row })),
        },
      ];
    }),
  );
  const chain = (run: () => Row[]) => {
    const promise = Promise.resolve().then(run);
    return Object.assign(promise, {
      for: async () => await promise,
      orderBy: async () => await promise,
      returning: async () => await promise,
    });
  };
  const database = fakeDatabase({
    query,
    select: (selection?: Row) =>
      selection?.text !== undefined
        ? drizzle.mock({ schema }).select(selection as { text: SQL })
        : {
            from: (table: Parameters<typeof getTableName>[0]) => {
              const name = getTableName(table);
              const select = (where?: SQL) =>
                rows(name)
                  .filter((row) => matches(row, where))
                  .map((row) => (selection?.name ? { name: row.name } : { ...row }));
              return {
                where: (where?: SQL) => chain(() => select(where)),
                innerJoin: () => ({
                  where: (where?: SQL) => ({
                    orderBy: async () =>
                      rows(name)
                        .filter((row) => matches(row, where))
                        .map((row) => ({
                          approval: { ...row },
                          fileTitle:
                            rows("file").find((file) => file.id === row.fileId)?.title ?? "Missing",
                        }))
                        .sort(
                          (a, b) => Number(b.approval.createdAt) - Number(a.approval.createdAt),
                        ),
                  }),
                }),
                leftJoin: () => ({
                  where: async () => [{ timeZone: rows("cloud_task")[0]?.timeZone ?? null }],
                }),
              };
            },
          },
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (values: Row) => {
        const name = getTableName(table);
        writes.push({ table: name, values: { ...values } });
        const insert = () => {
          const saved = {
            createdAt: new Date("2026-10-01"),
            resolvedAt: null,
            conflict: null,
            kind: "sync",
            ...values,
          };
          const target = rows(name);
          const existing =
            name === "cloud_workspace_file"
              ? target.find((row) => row.fileId === values.fileId && row.userId === values.userId)
              : undefined;
          if (existing) Object.assign(existing, values);
          else target.push(saved);
          return [];
        };
        const promise = Promise.resolve().then(insert);
        return Object.assign(promise, {
          onConflictDoUpdate: async () => await promise,
          onConflictDoNothing: async () => await promise,
        });
      },
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Row) => ({
        where: (where: SQL) =>
          chain(() => {
            const name = getTableName(table);
            const affected = rows(name).filter((row) => matches(row, where));
            writes.push({ table: name, values: { ...values } });
            for (const row of affected) Object.assign(row, values);
            return affected.map((row) => ({ ...row }));
          }),
      }),
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async (where: SQL) => {
        const name = getTableName(table);
        tables.set(
          name,
          rows(name).filter((row) => !matches(row, where)),
        );
      },
    }),
    recordStatement: async (statement: SQL) => {
      const rendered = dialect.sqlToQuery(statement);
      statements.push(rendered);
      if (rendered.sql.includes("string_agg")) return [{ text: "# extracted text" }];
      if (rendered.sql.includes("INSERT INTO file_event")) return [{ id: fileId }];
      return metadata;
    },
  });
  const files = new Map<string, Uint8Array>();
  files.set(`${CLOUD_WORKSPACE}/report.md`, new TextEncoder().encode("# report"));
  const written: string[] = [],
    removed: string[] = [],
    reads: string[] = [],
    storageWrites: string[] = [];
  let running = true;
  let invalidated = 0;
  const box: CloudBox = {
    sandbox: {} as CloudBox["sandbox"],
    recordings: Effect.succeed([]),
    id: "sandbox",
    userId: ctx.userId,
    exec: () => Effect.succeed({ exitCode: 0, output: "" }),
    writeFile: (path, bytes) =>
      Effect.sync(() => {
        written.push(path);
        files.set(path, bytes);
      }),
    readFile: (path) =>
      Effect.suspend(() => {
        reads.push(path);
        const bytes = files.get(path);
        return bytes
          ? Effect.succeed(bytes)
          : Effect.fail(new SandboxInputRejected({ reason: "missing" }));
      }),
    fileInfo: (path) =>
      Effect.succeed(
        files.has(path)
          ? Option.some({ size: files.get(path)!.length, isDir: false })
          : Option.none(),
      ),
    removeFile: (path) =>
      Effect.sync(() => {
        removed.push(path);
        files.delete(path);
      }),
    startCommand: () => Effect.die("unused"),
    commandStatus: () => Effect.die("unused"),
    commandLogs: () => Effect.die("unused"),
    endSession: () => Effect.void,
    startDesktop: Effect.void,
    startRecording: () => Effect.succeed(Option.none()),
    stopRecording: () => Effect.void,
  };
  const boxes = CloudBoxes.of({
    ensure: () => Effect.succeed(box),
    running: () => Effect.succeed(running ? Option.some(box) : Option.none()),
    stop: () => Effect.void,
  });
  const cache = SemanticCache.of({
    lookupExact: () => Effect.succeed(Option.none()),
    lookupSimilar: () => Effect.succeed(Option.none()),
    store: () => Effect.void,
    invalidate: () =>
      Effect.sync(() => {
        invalidated++;
      }),
  });
  const assetService = (storage: Storage["Service"]): AssetStore["Service"] => {
    const make = makeAssetStore({ ...assetSettings, repository: assetRepository(database) }).pipe(
      Effect.provideService(Storage, storage),
    );
    return AssetStore.of({
      put: (owner, input) => make.pipe(Effect.flatMap((service) => service.put(owner, input))),
      get: (id) => make.pipe(Effect.flatMap((service) => service.get(id))),
      list: (owner, filters) =>
        make.pipe(Effect.flatMap((service) => service.list(owner, filters))),
      load: (entry) => storage.get(entry.storageKey),
      url: (entry) =>
        `${assetSettings.appUrl}/a/${signAssetToken(entry.id, Redacted.value(assetSettings.secret))}`,
      resolve: (token) => verifyAssetToken(token, Redacted.value(assetSettings.secret)),
    });
  };
  const services = (storage: Storage["Service"]) =>
    Context.make(Database, database).pipe(
      Context.add(AssetStore, assetService(storage)),
      Context.add(Storage, {
        ...storage,
        put: (key, bytes, options) =>
          Effect.sync(() => {
            storageWrites.push(key);
          }).pipe(Effect.andThen(storage.put(key, bytes, options))),
      }),
      Context.add(Crypto.Crypto, testCrypto),
      Context.add(SemanticCache, cache),
      Context.add(CloudBoxes, boxes),
      Context.add(
        Retrieval,
        Retrieval.of({ search: () => Effect.die("Topic retrieval not used by this fixture") }),
      ),
    );
  const workspaceRow = (overrides: Row = {}): Row => ({
    userId: ctx.userId,
    fileId: fileId,
    sandboxPath: `${CLOUD_WORKSPACE}/inputs/Physics/Lecture-12345678.pdf`,
    contentHash: "base",
    sizeBytes: 5,
    hydratedAt: new Date(0),
    lastUsedAt: new Date(0),
    lastRunId: "old-run",
    ...overrides,
  });
  const addOld = () =>
    rows("cloud_workspace_file").push(
      workspaceRow({
        fileId: "old-file",
        sandboxPath: `${CLOUD_WORKSPACE}/inputs/old`,
        sizeBytes: WORKSPACE_CAP_BYTES,
        lastRunId: "old-run",
      }),
    );
  return {
    database,
    tables,
    rows,
    metadata,
    writes,
    statements,
    files,
    written,
    removed,
    reads,
    storageWrites,
    services,
    workspaceRow,
    addOld,
    setRunning: (value: boolean) => {
      running = value;
    },
    invalidated: () => invalidated,
  };
};
