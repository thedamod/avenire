import { ItemId, UserId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { candidateFilter } from "./lanes.ts";

const userId = UserId.make("user");
const dialect = new PgDialect();

describe("candidateFilter", () => {
  it("binds item ids and inclusive/exclusive content time bounds", () => {
    const ids = [ItemId.make("first"), ItemId.make("second")];
    const since = "2026-10-01T00:00:00Z";
    const until = "2026-10-09T00:00:00Z";
    const rendered = dialect.sqlToQuery(
      candidateFilter(userId, { text: "test", itemIds: ids, since, until }),
    );
    expect(rendered.sql).toContain("i.placement <> 'archived'");
    expect(rendered.sql).toMatch(/AND i.id IN \(\$\d+, \$\d+\)/u);
    expect(rendered.sql).toMatch(
      /coalesce\(i.content_modified_at, i.created_at\) >= \$\d+::timestamptz/u,
    );
    expect(rendered.sql).toMatch(
      /coalesce\(i.content_modified_at, i.created_at\) < \$\d+::timestamptz/u,
    );
    expect(rendered.params).toEqual([userId, userId, ...ids, since, until]);
    expect(rendered.sql).not.toContain(since);
  });

  it("matches nothing for an explicit empty item list", () => {
    const rendered = dialect.sqlToQuery(candidateFilter(userId, { text: "test", itemIds: [] }));
    expect(rendered.sql).toContain("AND false");
    expect(rendered.sql).not.toContain("IN ()");
    expect(dialect.sqlToQuery(candidateFilter(userId, { text: "test" })).sql).not.toContain(
      "AND false",
    );
  });
});
