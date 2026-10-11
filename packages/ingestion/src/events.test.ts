import { FileEventId, FileId, UserId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { fileEventStatement } from "./events.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");
const id = FileEventId.make("event");

describe("fileEventStatement", () => {
  it("inserts from the owned file and checks ten-minute opened activity in one statement", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      fileEventStatement(userId, fileId, id, "opened", { origin: "detail" }),
    );
    expect(sql).toMatch(/FROM file WHERE id = \$\d+ AND user_id = \$\d+ FOR UPDATE/u);
    expect(sql).toContain("INSERT INTO file_event");
    expect(sql).toContain("FROM owned");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("e.kind = 'opened'");
    expect(sql).toContain("e.at >= now() - interval '10 minutes'");
    expect(sql).toContain("SELECT id FROM owned");
    expect(params).toEqual([
      fileId,
      userId,
      id,
      "opened",
      '{"origin":"detail"}',
      "opened",
      userId,
      fileId,
    ]);
  });

  it("debounces only opened and encodes omitted metadata as an empty object", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      fileEventStatement(userId, fileId, id, "edited"),
    );
    expect(sql).toMatch(/WHERE \$\d+ <> 'opened' OR NOT EXISTS/u);
    expect(params).toContain("{}");
    expect(params.filter((value) => value === "edited")).toHaveLength(2);
  });
});
