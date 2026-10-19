import { file, fileEvent } from "@avenire/database/schema";
import { and, eq, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it } from "@effect/vitest";

const db = drizzle.mock();

describe("file event builders", () => {
  it("locks an owned file before recording activity", () => {
    const query = db
      .select({ id: file.id })
      .from(file)
      .where(and(eq(file.id, "file"), eq(file.userId, "user")))
      .for("update")
      .toSQL();
    expect(query.sql).toContain("for update");
    expect(query.params).toEqual(["file", "user"]);
  });
  it("checks recent opened events within the user's file", () => {
    const query = db
      .select({ id: fileEvent.id })
      .from(fileEvent)
      .where(
        and(
          eq(fileEvent.userId, "user"),
          eq(fileEvent.fileId, "file"),
          eq(fileEvent.kind, "opened"),
          gte(fileEvent.at, new Date(0)),
        ),
      )
      .limit(1)
      .toSQL();
    expect(query.sql).toContain('"file_event"."at" >=');
    expect(query.params.slice(0, 3)).toEqual(["user", "file", "opened"]);
  });
});
