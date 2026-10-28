import { FileId, FolderId, UserId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as schema from "@avenire/database/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";

import {
  FILING,
  assignFoldersTx,
  decideFolder,
  refreshFolderCentroidsTx,
  setFileFoldersTx,
} from "./folder.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");
const folderId = FolderId.make("folder");
const otherFolderId = FolderId.make("other-folder");

type Vector = number[];
type FileState = {
  userId: string;
  vectors: Vector[];
  placement: "inbox" | "filed" | "archived";
  archived?: boolean;
  purging?: boolean;
  source?: string;
  dedupeKey?: string;
};
type FolderState = { userId: string; centroid: Vector | null; suggested?: boolean };
type Hydration = { userId: string; runId: string; fileIds: string[] };
type Membership = { userId: string; fileId: string; folderId: string };
type Query = { tx: number; sql: string; params: unknown[] };

const average = (vectors: Vector[]): Vector | null =>
  vectors.length === 0
    ? null
    : vectors[0]!.map(
        (_, index) => vectors.reduce((sum, vector) => sum + vector[index]!, 0) / vectors.length,
      );

/**
 * Runs the production helpers through Drizzle's real postgres-js adapter. This is a
 * deterministic database model, not PostgreSQL: SQL assertions below check the actual
 * aggregate and ownership predicates, and the model permits controlled lock contention.
 */
const fixture = () => {
  const files = new Map<string, FileState>();
  const folders = new Map<string, FolderState>();
  let memberships: Membership[] = [];
  const hydrations: Hydration[] = [];
  const queries: Query[] = [];
  let revision = 0;
  let sequence = 0;
  let lockOwner: number | undefined;
  const lockWaiters: Array<() => void> = [];
  let barrier:
    | { matches: (query: Query) => boolean; entered: () => void; resume: Promise<void> }
    | undefined;
  let waitingForLock: (() => void) | undefined;

  const run = async (tx: number, statement: string, params: unknown[]) => {
    const query = { tx, sql: statement, params };
    queries.push(query);
    if (statement.startsWith('select "id" from "user"')) {
      if (lockOwner !== tx) {
        if (lockOwner !== undefined) {
          waitingForLock?.();
          await new Promise<void>((resolve) => lockWaiters.push(resolve));
        }
        lockOwner = tx;
      }
      return [[params[0]]];
    }
    if (barrier?.matches(query)) {
      const current = barrier;
      barrier = undefined;
      current.entered();
      await current.resume;
    }
    if (statement.startsWith('update "user"')) {
      revision += 1;
      return [];
    }
    if (statement.startsWith('select "id" from "file"')) {
      const row = files.get(String(params[0]));
      return row?.userId === params[1] ? [[params[0]]] : [];
    }
    if (statement.startsWith('select "id", "source", "dedupe_key" from "file"')) {
      const row = files.get(String(params[0]));
      return row &&
        row.userId === params[1] &&
        !row.archived &&
        !row.purging &&
        row.placement !== "archived"
        ? [[params[0], row.source ?? "upload", row.dedupeKey ?? `upload:${params[0]}`]]
        : [];
    }
    if (statement.startsWith('select "selector", "files" from "cloud_hydration"')) {
      return hydrations
        .filter((row) => row.userId === params[0] && row.runId === params[1])
        .map((row) => [
          JSON.stringify({}),
          JSON.stringify(row.fileIds.map((id) => ({ fileId: id }))),
        ]);
    }
    if (statement.startsWith('select distinct "folder_id" from "file_folder"')) {
      const ids = params.slice(1).map(String);
      return [
        ...new Set(
          memberships
            .filter((row) => row.userId === params[0] && ids.includes(row.fileId))
            .map((row) => row.folderId),
        ),
      ].map((id) => [id]);
    }
    if (statement.startsWith('select "folder_id" from "file_folder"')) {
      return memberships
        .filter((row) => row.userId === params[0] && row.fileId === params[1])
        .sort((left, right) => left.folderId.localeCompare(right.folderId))
        .map((row) => [row.folderId]);
    }
    if (statement.startsWith('select avg("embedding") from "chunk"')) {
      const row = files.get(String(params[1]));
      return [[row && row.userId === params[0] ? JSON.stringify(average(row.vectors)) : null]].map(
        ([vector]) => [vector === "null" ? null : vector],
      );
    }
    if (statement.startsWith('select "id", "centroid" from "folder"')) {
      // Params: user, suggested=false, optional candidate ids, vector, limit.
      const vector = JSON.parse(String(params.at(-2))) as Vector;
      const only = statement.includes('"folder"."id" in')
        ? params.slice(2, -2).map(String)
        : undefined;
      const distance = (centroid: Vector) =>
        centroid.reduce((sum, value, index) => sum + value * vector[index]!, 0) /
        (Math.hypot(...centroid) * Math.hypot(...vector));
      return [...folders]
        .filter(
          ([id, row]) =>
            row.userId === params[0] &&
            row.centroid !== null &&
            !row.suggested &&
            (only === undefined || only.includes(id)),
        )
        .sort((left, right) => distance(right[1].centroid!) - distance(left[1].centroid!))
        .slice(0, Number(params.at(-1)))
        .map(([id, row]) => [id, JSON.stringify(row.centroid)]);
    }
    if (statement.startsWith('select "id" from "folder"')) {
      return [...folders]
        .filter(([id, row]) => row.userId === params[0] && params.slice(1).includes(id))
        .map(([id]) => [id]);
    }
    if (statement.startsWith('delete from "file_folder"')) {
      memberships = memberships.filter(
        (row) => !(row.userId === params[0] && row.fileId === params[1]),
      );
      return [];
    }
    if (statement.startsWith('insert into "file_folder"')) {
      for (let index = 0; index < params.length; index += 3) {
        const row = {
          fileId: String(params[index]),
          folderId: String(params[index + 1]),
          userId: String(params[index + 2]),
        };
        if (
          !memberships.some(
            (existing) => existing.fileId === row.fileId && existing.folderId === row.folderId,
          )
        )
          memberships.push(row);
      }
      return [];
    }
    if (statement.startsWith('insert into "folder"')) {
      folders.set(String(params[0]), { userId: String(params[1]), centroid: null });
      return [];
    }
    if (statement.startsWith('update "chunk"')) {
      const row = files.get(String(params[2]));
      if (row && row.userId === params[1])
        row.vectors = row.vectors.map(() => JSON.parse(String(params[0])) as Vector);
      return [];
    }
    if (statement.startsWith('update "file"')) {
      const row = files.get(String(params[1]));
      if (row && row.userId === params[2]) row.placement = params[0] as FileState["placement"];
      return [];
    }
    if (statement.startsWith('update "folder"')) {
      // Aggregate SQL has inner user/archive parameters before outer ownership/ids.
      const outerUser = params[2];
      for (const [id, row] of folders) {
        if (row.userId !== outerUser || (params.length > 3 && !params.slice(3).includes(id)))
          continue;
        const vectors = memberships
          .filter((member) => member.userId === outerUser && member.folderId === id)
          .flatMap((member) => {
            const candidate = files.get(member.fileId);
            if (
              !candidate ||
              candidate.userId !== outerUser ||
              candidate.archived ||
              candidate.purging ||
              candidate.placement === "archived"
            )
              return [];
            const vector = average(candidate.vectors);
            return vector === null ? [] : [vector];
          });
        row.centroid = average(vectors);
      }
      return [];
    }
    throw new Error(`Unexpected folder query: ${statement}`);
  };

  const clientFor = (tx: number): unknown => ({
    options: { parsers: {}, serializers: {} },
    unsafe: (statement: string, params: unknown[]) => {
      const result = run(tx, statement, params);
      return Object.assign(result, { values: () => result });
    },
    begin: async <A>(callback: (client: unknown) => Promise<A>) => {
      const transactionId = ++sequence;
      try {
        return await callback(clientFor(transactionId));
      } finally {
        if (lockOwner === transactionId) {
          lockOwner = undefined;
          lockWaiters.shift()?.();
        }
      }
    },
  });
  const db = drizzle({ client: clientFor(0) as never, schema });
  return {
    db,
    files,
    folders,
    queries,
    get memberships() {
      return memberships;
    },
    get revision() {
      return revision;
    },
    addFile(id: string, vectors: Vector[], owner = userId) {
      files.set(id, { userId: owner, vectors, placement: "inbox" });
    },
    addFolder(id: string, centroid: Vector | null, owner = userId, suggested = false) {
      folders.set(id, { userId: owner, centroid, suggested });
    },
    addHydration(runId: string, fileIds: string[]) {
      hydrations.push({ userId, runId, fileIds });
    },
    addMember(id: string, target: string) {
      memberships.push({ userId, fileId: id, folderId: target });
      files.get(id)!.placement = "filed";
    },
    pause(matches: (query: Query) => boolean) {
      let resume!: () => void;
      let entered!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        resume = resolve;
      });
      barrier = { matches, entered, resume: pending };
      return { reached, resume };
    },
    lockContention() {
      return new Promise<void>((resolve) => {
        waitingForLock = resolve;
      });
    },
  };
};

describe("folder membership publication", () => {
  it("serializes competing assignments before reading nearest folders and retains every contribution", async () => {
    const state = fixture();
    state.addFile("seed", [[1, 0]]);
    state.addFile(fileId, [
      [1, 0.2],
      [1, 0.2],
    ]);
    state.addFile("second", [[1, 0.4]]);
    state.addFolder(folderId, [1, 0]);
    state.addMember("seed", folderId);
    const paused = state.pause((query) => query.sql.startsWith('select "id", "centroid"'));
    const first = state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId));
    await paused.reached;
    const contention = state.lockContention();
    const second = state.db.transaction((tx) => assignFoldersTx(tx, userId, FileId.make("second")));
    await contention;
    expect(state.queries.filter((query) => query.tx === 2)).toHaveLength(1);
    paused.resume();
    expect(await Promise.all([first, second])).toEqual([folderId, folderId]);
    expect(state.memberships.map((row) => row.fileId).sort()).toEqual(
      [fileId, "second", "seed"].sort(),
    );
    expect(state.folders.get(folderId)!.centroid![0]).toBeCloseTo(1);
    expect(state.folders.get(folderId)!.centroid![1]).toBeCloseTo(0.2);
    const aggregate = state.queries.find((query) => query.sql.startsWith('update "folder"'))!;
    expect(aggregate.sql.match(/avg\(/g)).toHaveLength(2);
    expect(aggregate.sql).toContain('group by "file"."id"');
    expect(aggregate.sql).toContain('"file"."archived_at" is null');
    expect(aggregate.sql).toContain('"file"."purge_started_at" is null');
    expect(aggregate.sql).toContain('"chunk"."user_id" = "file"."user_id"');
    expect(aggregate.params).toEqual([userId, "archived", userId, folderId]);
  });

  it("refreshes an existing member after changed or removed chunks without moving manual memberships", async () => {
    const state = fixture();
    state.addFile(fileId, [[0, 1]]);
    state.addFile("other", [
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
    state.addFolder(folderId, [1, 0]);
    state.addMember(fileId, folderId);
    state.addMember("other", folderId);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBe(folderId);
    expect(state.folders.get(folderId)!.centroid).toEqual([0.5, 0.5]);
    state.files.get(fileId)!.vectors = [];
    await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId));
    expect(state.folders.get(folderId)!.centroid).toEqual([1, 0]);
    expect(state.folders.has(otherFolderId)).toBe(false);
    expect(state.memberships).toHaveLength(2);
    expect(
      state.queries.some(
        (query) => query.sql.includes("order by") && query.sql.includes("centroid"),
      ),
    ).toBe(false);
  });

  it("moves into all selected folders, deduplicates membership, and clears old and empty aggregates", async () => {
    const state = fixture();
    state.addFile(fileId, [[2, 0]]);
    state.addFile("other", [[0, 2]]);
    state.addFolder(folderId, [2, 0]);
    state.addFolder(otherFolderId, [0, 2]);
    state.addFolder("third", null);
    state.addMember(fileId, folderId);
    state.addMember("other", otherFolderId);
    expect(
      await state.db.transaction((tx) =>
        setFileFoldersTx(tx, userId, fileId, [
          otherFolderId,
          FolderId.make("third"),
          otherFolderId,
        ]),
      ),
    ).toBe(true);
    expect(state.folders.get(folderId)!.centroid).toBeNull();
    expect(state.folders.get(otherFolderId)!.centroid).toEqual([1, 1]);
    expect(state.folders.get("third")!.centroid).toEqual([2, 0]);
    expect(state.memberships.filter((row) => row.fileId === fileId)).toHaveLength(2);
    expect(state.files.get(fileId)!.placement).toBe("filed");
    expect(await state.db.transaction((tx) => setFileFoldersTx(tx, userId, fileId, []))).toBe(true);
    expect(state.files.get(fileId)!.placement).toBe("inbox");
    expect(state.folders.get(otherFolderId)!.centroid).toEqual([0, 2]);
    expect(state.folders.get("third")!.centroid).toBeNull();
    expect(state.revision).toBe(2);
  });

  it("serializes reingestion and a move, rebuilding every old/new folder with one revision per publication", async () => {
    const state = fixture();
    state.addFile(fileId, [[1, 0]]);
    state.addFile("remaining", [
      [0, 2],
      [0, 2],
    ]);
    state.addFolder(folderId, [0.5, 1]);
    state.addFolder(otherFolderId, [1, 0]);
    state.addFolder("target", null);
    state.addMember(fileId, folderId);
    state.addMember(fileId, otherFolderId);
    state.addMember("remaining", folderId);
    const paused = state.pause((query) => query.sql.startsWith('update "folder"'));
    const publication = state.db.transaction(async (tx) => {
      // Mirrors the publication caller: corpus -> file -> chunk swap -> folders -> revision.
      await lockCorpus(tx, userId);
      await tx
        .select({ id: schema.file.id })
        .from(schema.file)
        .where(and(eq(schema.file.id, fileId), eq(schema.file.userId, userId)))
        .for("update");
      await tx
        .update(schema.chunk)
        .set({ embedding: [0, 4] })
        .where(and(eq(schema.chunk.userId, userId), eq(schema.chunk.fileId, fileId)));
      const result = await assignFoldersTx(tx, userId, fileId);
      await advanceCorpusRevision(tx, userId);
      return result;
    });
    await paused.reached;
    const contention = state.lockContention();
    const move = state.db.transaction((tx) =>
      setFileFoldersTx(tx, userId, fileId, [FolderId.make("target")]),
    );
    await contention;
    expect(state.queries.filter((query) => query.tx === 2)).toHaveLength(1);
    paused.resume();
    expect(await publication).toBe(folderId);
    expect(await move).toBe(true);
    expect(state.folders.get(folderId)!.centroid).toEqual([0, 2]);
    expect(state.folders.get(otherFolderId)!.centroid).toBeNull();
    expect(state.folders.get("target")!.centroid).toEqual([0, 4]);
    expect(state.folders.has("unused")).toBe(false);
    expect(state.revision).toBe(2);
    const aggregates = state.queries.filter((query) => query.sql.startsWith('update "folder"'));
    expect(aggregates.map((query) => query.params.slice(3))).toEqual([
      [folderId, otherFolderId],
      [folderId, otherFolderId, "target"],
    ]);
    for (const tx of [1, 2]) {
      const queries = state.queries.filter((query) => query.tx === tx);
      expect(queries[0]!.sql).toContain('from "user"');
      const fileLock = queries.findIndex((query) =>
        query.sql.startsWith('select "id", "source", "dedupe_key" from "file"'),
      );
      const folderLock = queries.findIndex((query) =>
        query.sql.startsWith('select "id" from "folder"'),
      );
      expect(folderLock).toBeGreaterThan(fileLock);
      expect(queries[folderLock]!.sql).toContain('order by "folder"."id" for update');
      expect(queries.filter((query) => query.sql.startsWith('update "user"'))).toHaveLength(1);
    }
  });

  it("rejects a foreign target before removing existing memberships or publishing a revision", async () => {
    const state = fixture();
    state.addFile(fileId, [[1, 0]]);
    state.addFolder(folderId, [1, 0]);
    state.addFolder(otherFolderId, [0, 1], UserId.make("someone-else"));
    state.addMember(fileId, folderId);
    expect(
      await state.db.transaction((tx) => setFileFoldersTx(tx, userId, fileId, [otherFolderId])),
    ).toBe(false);
    expect(state.memberships).toEqual([{ userId, fileId, folderId }]);
    expect(state.files.get(fileId)!.placement).toBe("filed");
    expect(state.revision).toBe(0);
    expect(
      state.queries.some(
        (query) => query.sql.startsWith("delete") || query.sql.startsWith("update"),
      ),
    ).toBe(false);
  });

  it.each(["foreign", "archived", "purging"] as const)(
    "rejects an %s file for both manual and automatic assignment",
    async (kind) => {
      const state = fixture();
      state.addFile(fileId, [[1, 0]], kind === "foreign" ? UserId.make("other-user") : userId);
      if (kind === "archived") state.files.get(fileId)!.archived = true;
      if (kind === "purging") state.files.get(fileId)!.purging = true;
      state.addFolder(folderId, [1, 0]);
      expect(
        await state.db.transaction((tx) => setFileFoldersTx(tx, userId, fileId, [folderId])),
      ).toBe(false);
      expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBeNull();
      expect(state.memberships).toEqual([]);
      expect(state.revision).toBe(0);
      const ownedRead = state.queries.find((query) =>
        query.sql.startsWith('select "id", "source", "dedupe_key" from "file"'),
      )!;
      expect(ownedRead.sql).toContain('"file"."user_id" =');
      expect(ownedRead.sql).toContain('"file"."purge_started_at" is null');
      expect(ownedRead.sql).toContain("for update");
    },
  );

  it("excludes archived, purging, empty and foreign members from the aggregate", async () => {
    const state = fixture();
    state.addFolder(folderId, [99, 99]);
    for (const id of ["live", "archived", "purging", "empty", "foreign"]) {
      state.addFile(
        id,
        id === "empty" ? [] : [[2, 4]],
        id === "foreign" ? UserId.make("other") : userId,
      );
      state.addMember(id, folderId);
    }
    state.files.get("archived")!.archived = true;
    state.files.get("purging")!.purging = true;
    await state.db.transaction((tx) => refreshFolderCentroidsTx(tx, userId, [folderId]));
    expect(state.folders.get(folderId)!.centroid).toEqual([2, 4]);
    const aggregate = state.queries.at(-1)!;
    expect(aggregate.sql).toContain('"file"."user_id" = "file_folder"."user_id"');
    expect(aggregate.sql).toContain('"file_folder"."folder_id" = "folder"."id"');
    expect(aggregate.sql).toContain('"file_folder"."user_id" =');
    expect(aggregate.sql).toContain('"chunk"."embedding" is not null');
    expect(aggregate.sql).toContain('"file"."placement" <>');
    expect(aggregate.sql).not.toContain("coalesce");
    state.files.get("live")!.vectors = [];
    await state.db.transaction((tx) => refreshFolderCentroidsTx(tx, userId, [folderId]));
    expect(state.folders.get(folderId)!.centroid).toBeNull();
  });

  it("leaves an unmatched file in the Inbox instead of creating a notebook", async () => {
    const state = fixture();
    state.addFile(fileId, [
      [1, 0],
      [3, 0],
    ]);
    state.addFolder(otherFolderId, [0, 1]);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBeNull();
    expect(state.folders.size).toBe(1);
    expect(state.memberships).toEqual([]);
    expect(state.files.get(fileId)!.placement).toBe("inbox");
    expect(state.queries.some((query) => query.sql.startsWith('insert into "folder"'))).toBe(false);
  });

  it("files a confident match and marks it filed, leaving revision publication to the caller", async () => {
    const state = fixture();
    state.addFile(fileId, [[1, 0.1]]);
    state.addFolder(folderId, [1, 0]);
    state.addFolder(otherFolderId, [0, 1]);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBe(folderId);
    expect(state.memberships).toEqual([{ userId, fileId, folderId }]);
    expect(state.files.get(fileId)!.placement).toBe("filed");
    expect(state.revision).toBe(0);
  });

  it("ignores suggested notebooks and stays in the Inbox between two close matches", async () => {
    const state = fixture();
    state.addFile(fileId, [[1, 1]]);
    state.addFolder("proposal", [1, 1], userId, true);
    state.addFolder(folderId, [1, 0.9]);
    state.addFolder(otherFolderId, [0.9, 1]);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBeNull();
    expect(state.memberships).toEqual([]);
  });

  it("scopes a Ruth Cloud output to the notebooks its run read, with the lower bar", async () => {
    const state = fixture();
    state.addFile("source", [[1, 0]]);
    state.addFolder(folderId, [1, 0]);
    state.addMember("source", folderId);
    // Closer to an unrelated notebook overall, but the run only read `folderId`.
    state.addFolder(otherFolderId, [0.3, 1]);
    state.addFile(fileId, [[0.6, 1]]);
    state.files.get(fileId)!.source = "ruth-cloud";
    state.files.get(fileId)!.dedupeKey = `ruth-cloud:run-1:${fileId}`;
    state.addHydration("run-1", ["source"]);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBe(folderId);
    expect(state.files.get(fileId)!.placement).toBe("filed");
  });

  it("files a Ruth Cloud output that read nothing by the library rule", async () => {
    const state = fixture();
    state.addFolder(folderId, [1, 0]);
    state.addFile(fileId, [[0.6, 1]]);
    state.files.get(fileId)!.source = "ruth-cloud";
    state.files.get(fileId)!.dedupeKey = `ruth-cloud:run-2:${fileId}`;
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBeNull();
  });

  it("does not create a folder without embeddings or issue an empty aggregate update", async () => {
    const state = fixture();
    state.addFile(fileId, []);
    expect(await state.db.transaction((tx) => assignFoldersTx(tx, userId, fileId))).toBeNull();
    expect(state.folders.size).toBe(0);
    const count = state.queries.length;
    await state.db.transaction((tx) => refreshFolderCentroidsTx(tx, userId, []));
    expect(state.queries).toHaveLength(count);
  });
});

describe("decideFolder", () => {
  it("joins only above the bar and with a margin over the runner-up", () => {
    const rule = FILING.library;
    expect(decideFolder([], rule)).toEqual({ folderId: null, reason: "no-candidates" });
    expect(decideFolder([{ id: "a", similarity: 0.79 }], rule)).toMatchObject({
      reason: "below-threshold",
    });
    expect(
      decideFolder(
        [
          { id: "a", similarity: 0.86 },
          { id: "b", similarity: 0.83 },
        ],
        rule,
      ),
    ).toMatchObject({ folderId: null, reason: "ambiguous" });
    expect(
      decideFolder(
        [
          { id: "a", similarity: 0.9 },
          { id: "b", similarity: 0.6 },
        ],
        rule,
      ),
    ).toEqual({ folderId: "a", similarity: 0.9 });
    expect(decideFolder([{ id: "a", similarity: 0.5 }], FILING.readByRun)).toMatchObject({
      folderId: "a",
    });
  });
});
