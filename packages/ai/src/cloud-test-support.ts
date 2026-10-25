/** Recording Drizzle doubles. They exercise service logic/SQL predicates, never a live database. */
import {
  Database,
  DatabaseError,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@avenire/database/client";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { randomBytes, createHash } from "node:crypto";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";

type Row = Record<string, unknown>;
const camel = (name: string) =>
  name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
const dialect = new PgDialect();
export const fakeCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  digest: (algorithm, data) =>
    Effect.sync(
      () =>
        new Uint8Array(createHash(algorithm.replace("-", "").toLowerCase()).update(data).digest()),
    ),
});
export const recordingDatabase = (events: string[] = []) => {
  const tables = new Map<string, Row[]>();
  const statements: { sql: string; params: unknown[] }[] = [];
  const writes: { table: string; values: Row }[] = [];
  const rows = (table: string) => {
    let values = tables.get(table);
    if (!values) {
      values = [];
      tables.set(table, values);
    }
    return values;
  };
  let clock = 0;
  const matches = (name: string, row: Row, where?: SQL) => {
    if (!where) return true;
    const compiled = dialect.sqlToQuery(where);
    statements.push(compiled);
    for (const match of compiled.sql.matchAll(/"(\w+)"\."(\w+)" is null/gi))
      if (match[1] === name && row[camel(match[2]!)] != null) return false;
    if (name === "cloud_run" && compiled.sql.includes("cleanupComplete")) {
      const blocks = (candidate: Row) =>
        ["provisioning", "running"].includes(String(candidate.status)) ||
        (candidate.leasedBy != null &&
          (candidate.usage as { cleanupComplete?: boolean } | undefined)?.cleanupComplete !== true);
      if (compiled.sql.includes("not exists")) {
        if (
          rows(name).some(
            (candidate) =>
              candidate.userId === row.userId && candidate.id !== row.id && blocks(candidate),
          )
        )
          return false;
      } else if (!blocks(row)) return false;
    }
    const expiry =
      /coalesce\("cloud_run"\."lease_expires_at", '-infinity'::timestamptz\) <= \$(\d+)/.exec(
        compiled.sql,
      );
    if (
      name === "cloud_run" &&
      expiry &&
      row.leaseExpiresAt != null &&
      Number(row.leaseExpiresAt) > Number(compiled.params[Number(expiry[1]) - 1])
    )
      return false;
    for (const match of compiled.sql.matchAll(/"(\w+)"\."(\w+)" (=|<>|!=|<=|>=|<|>) \$(\d+)/g)) {
      if (match[1] !== name) continue;
      const value = row[camel(match[2]!)];
      const param = compiled.params[Number(match[4]) - 1];
      const numeric = (input: unknown) =>
        input instanceof Date
          ? input.getTime()
          : typeof input === "string" && Number.isNaN(Number(input))
            ? Date.parse(input)
            : Number(input);
      if (match[3] === "=" && value !== param) return false;
      if (["<>", "!="].includes(match[3]!) && value === param) return false;
      if (["<", "<=", ">", ">="].includes(match[3]!) && value == null) return false;
      if (match[3] === "<=" && !(numeric(value) <= numeric(param))) return false;
      if (match[3] === ">=" && !(numeric(value) >= numeric(param))) return false;
      if (match[3] === "<" && !(numeric(value) < numeric(param))) return false;
      if (match[3] === ">" && !(numeric(value) > numeric(param))) return false;
    }
    for (const match of compiled.sql.matchAll(/"(\w+)"\."(\w+)" in \(([^)]+)\)/gi)) {
      if (match[1] !== name) continue;
      // Literal status alternatives in blocksUser are evaluated as one OR expression above.
      if (!match[3]!.includes("$")) continue;
      const values = [...match[3]!.matchAll(/\$(\d+)/g)].map(
        (slot) => compiled.params[Number(slot[1]) - 1],
      );
      if (!values.includes(row[camel(match[2]!)])) return false;
    }
    return true;
  };
  const chain = <A>(run: (conflictUpdate?: Row) => A) => {
    let conflictUpdate: Row | undefined;
    let promise: Promise<A> | undefined;
    const resolve = () => (promise ??= Promise.resolve().then(() => run(conflictUpdate)));
    const builder = {
      // eslint-disable-next-line unicorn/no-thenable -- Drizzle builders are deliberately lazy PromiseLike values.
      then: <B>(yes: (value: A) => B, no?: (error: unknown) => B) => resolve().then(yes, no),
      returning: () => resolve(),
      onConflictDoNothing: () => builder,
      onConflictDoUpdate: ({ set }: { set: Row }) => {
        conflictUpdate = set;
        return builder;
      },
    };
    return builder;
  };
  const defaults = (name: string, values: Row): Row => ({
    createdAt: new Date(clock),
    updatedAt: new Date(clock),
    ...(name === "cloud_task"
      ? {
          timeZone: "UTC",
          preHydration: [],
          enabled: true,
          model: "ruth-core",
          network: "packages",
          builtin: null,
          oneOff: false,
          maxAttempts: 2,
          lastRunAt: null,
          nextRunAt: null,
        }
      : {}),
    ...(name === "cloud_run"
      ? {
          folderId: null,
          summary: null,
          reportMessageId: null,
          logTail: null,
          startedAt: null,
          finishedAt: null,
          error: null,
          sandboxId: null,
          claimedAt: null,
          leasedBy: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          recordingId: null,
          modelName: null,
          promptVersion: null,
          inputsSlug: null,
          messages: [],
          stepIndex: 0,
          usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
          attempt: 1,
          notBefore: new Date(clock),
        }
      : {}),
    ...values,
  });
  const evaluate = (values: Row, row?: Row): Row =>
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        if (value && typeof value === "object" && "queryChunks" in value) {
          const compiled = dialect.sqlToQuery(value as SQL);
          return [
            key,
            compiled.sql.includes("now()")
              ? new Date(clock)
              : Number(row?.[key] ?? 0) + Number(compiled.params[0] ?? 0),
          ];
        }
        return [key, value];
      }),
    );
  const mock = {
    query: Object.fromEntries(
      [
        "cloudTask",
        "cloudRun",
        "cloudRunEvent",
        "cloudToolCall",
        "asset",
        "cloudHydration",
        "ruthThread",
        "user",
      ].map((key) => {
        const name = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        const find = (where?: SQL) =>
          rows(name)
            .filter((row) => matches(name, row, where))
            .map((row) => ({ ...row }));
        return [
          key,
          {
            findFirst: async ({ where }: { where?: SQL } = {}) => find(where)[0],
            findMany: async ({ where }: { where?: SQL } = {}) => find(where),
          },
        ];
      }),
    ),
    select: (selection?: Row) => ({
      from: (table: Parameters<typeof getTableName>[0]) => {
        const name = getTableName(table);
        let condition: SQL | undefined;
        let joined = false;
        let limit = Infinity;
        const result = () =>
          rows(name)
            .filter((row) => matches(name, row, condition))
            .slice(0, limit)
            .map((row, _index, all) => {
              // The only aggregate the fake knows: max(seq) over the matched rows.
              if (selection && "max" in selection && name === "cloud_run_event")
                return { max: Math.max(-1, ...all.map((r) => Number(r.seq))) };
              if (joined && name === "cloud_run")
                return {
                  run: { ...row },
                  taskTitle: rows("cloud_task").find((task) => task.id === row.taskId)?.title,
                };
              if (joined && name === "pending_approval")
                return {
                  fileTitle: rows("file").find((file) => file.id === row.fileId)?.title,
                  summary: row.summary,
                  conflict: row.conflict,
                };
              if (!selection || (joined && name === "file")) return { ...row };
              return Object.fromEntries(
                Object.entries(selection).map(([key, column]) => [
                  key,
                  typeof column === "object" && column !== null && "name" in column
                    ? row[camel(String(column.name))]
                    : row[key],
                ]),
              );
            });
        const select = {
          where: (where: SQL) => {
            condition = where;
            return select;
          },
          innerJoin: () => {
            joined = true;
            return select;
          },
          orderBy: () => select,
          limit: (count: number) => {
            limit = count;
            return select;
          },
          for: async () => result(),
          // eslint-disable-next-line unicorn/no-thenable -- Drizzle builders are deliberately lazy PromiseLike values.
          then: <B>(yes: (values: Row[]) => B, no?: (error: unknown) => B) =>
            Promise.resolve().then(result).then(yes, no),
        };
        return select;
      },
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (input: Row | Row[]) => {
        const name = getTableName(table);
        return chain((conflictUpdate) =>
          (Array.isArray(input) ? input : [input]).flatMap((one) => {
            const values = evaluate(one);
            let existing: Row | undefined;
            if (name === "cloud_run_event")
              existing = rows(name).find(
                (row) =>
                  row.runId === values.runId &&
                  (row.seq === values.seq || (values.terminal === true && row.terminal === true)),
              );
            if (name === "cloud_tool_call")
              existing = rows(name).find(
                (row) => row.runId === values.runId && row.toolCallId === values.toolCallId,
              );
            if (name === "cloud_run")
              existing = rows(name).find(
                (row) =>
                  row.taskId === values.taskId &&
                  Number(row.scheduledFor) === Number(values.scheduledFor) &&
                  row.attempt === values.attempt,
              );
            if (name === "cloud_task" && values.builtin)
              existing = rows(name).find(
                (row) => row.userId === values.userId && row.builtin === values.builtin,
              );
            if (name === "ruth_thread")
              existing = rows(name).find(
                (row) => row.userId === values.userId && row.kind === "ruth-cloud",
              );
            if (name === "sandbox_usage") {
              existing = rows(name).find(
                (row) => row.userId === values.userId && row.day === values.day,
              );
              if (existing)
                existing.cloudSeconds = Number(existing.cloudSeconds) + Number(values.cloudSeconds);
            }
            if (name === "user_settings") {
              existing = rows(name).find((row) => row.userId === values.userId);
              if (existing && conflictUpdate) {
                Object.assign(existing, evaluate(conflictUpdate, existing));
                writes.push({ table: name, values: { ...conflictUpdate } });
                return [{ ...existing }];
              }
            }
            if (existing) return [];
            const saved = defaults(name, values);
            writes.push({ table: name, values: { ...values } });
            rows(name).push(saved);
            if (name === "ruth_message") events.push("report-posted");
            return [{ ...saved }];
          }),
        );
      },
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Row) => ({
        where: (where: SQL) =>
          chain(() => {
            const name = getTableName(table);
            const affected = rows(name).filter((row) => matches(name, row, where));
            writes.push({ table: name, values: { ...values } });
            for (const row of affected) Object.assign(row, evaluate(values, row));
            return affected.map((row) => ({ ...row }));
          }),
      }),
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async (where: SQL) => {
        const name = getTableName(table);
        tables.set(
          name,
          rows(name).filter((row) => !matches(name, row, where)),
        );
      },
    }),
    execute: async (statement: SQL) => {
      const compiled = dialect.sqlToQuery(statement);
      statements.push(compiled);
      return [{ acquired: true }];
    },
  };
  // The fake implements only the builders exercised above; the production service keeps its real types.
  const client = mock as unknown as DatabaseClient;
  let transactionTail = Promise.resolve();
  const transaction = <A>(fn: (tx: DatabaseTransaction) => Promise<A>): Promise<A> => {
    const result = transactionTail.then(() => fn(client as unknown as DatabaseTransaction));
    transactionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  Object.assign(client, { transaction });
  const database = Database.of({
    db: client,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(client), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => transaction(fn),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  });
  return {
    rows,
    writes,
    statements,
    database,
    setTime: (time: number) => {
      clock = time;
    },
  };
};
