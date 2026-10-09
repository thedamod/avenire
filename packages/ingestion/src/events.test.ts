import { ItemEventId, ItemId, UserId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { itemEventStatement } from "./events.ts";

const userId = UserId.make("user");
const itemId = ItemId.make("item");
const id = ItemEventId.make("event");

describe("itemEventStatement", () => {
  it("inserts from the owned item and checks ten-minute opened activity in one statement", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      itemEventStatement(userId, itemId, id, "opened", { origin: "detail" }),
    );
    expect(sql).toMatch(/FROM item WHERE id = \$\d+ AND user_id = \$\d+ FOR UPDATE/u);
    expect(sql).toContain("INSERT INTO item_event");
    expect(sql).toContain("FROM owned");
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("e.kind = 'opened'");
    expect(sql).toContain("e.at >= now() - interval '10 minutes'");
    expect(sql).toContain("SELECT id FROM owned");
    expect(params).toEqual([
      itemId,
      userId,
      id,
      "opened",
      '{"origin":"detail"}',
      "opened",
      userId,
      itemId,
    ]);
  });

  it("debounces only opened and encodes omitted metadata as an empty object", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      itemEventStatement(userId, itemId, id, "edited"),
    );
    expect(sql).toMatch(/WHERE \$\d+ <> 'opened' OR NOT EXISTS/u);
    expect(params).toContain("{}");
    expect(params.filter((value) => value === "edited")).toHaveLength(2);
  });
});
