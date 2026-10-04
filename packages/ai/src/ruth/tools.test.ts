import { describe, expect, it } from "@effect/vitest";
import { appendIncoming } from "./agent.ts";
import type { RuthUIMessage } from "./messages.ts";
import { findVisuals } from "./tools.ts";

const message = (id: string, role: RuthUIMessage["role"], text: string): RuthUIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

describe("findVisuals", () => {
  it("lists inline visuals that carry an id", () => {
    expect(
      findVisuals([
        'Here: <avenire-chart id="vis_1" title="Growth">{}</avenire-chart>',
        '<avenire-sim kit="kinematics" id="vis_2">…</avenire-sim> and <avenire-sim title="x">',
      ]),
    ).toEqual([
      { id: "vis_1", title: "Growth" },
      { id: "vis_2", title: "" },
    ]);
  });
});

describe("appendIncoming", () => {
  const options = { freshId: "fresh", createdAt: "2026-10-04T00:00:00.000Z" };
  const history = [message("u1", "user", "Explain eigenvalues"), message("a1", "assistant", "…")];

  it("continues the last assistant message when the ids match", () => {
    const continued = message("a1", "assistant", "approved");
    expect(appendIncoming(history, continued, options)).toEqual([history[0], continued]);
  });

  it("appends anything else as a user message", () => {
    const next = appendIncoming(history, message("u2", "assistant", "Again"), options);
    expect(next.map(({ id, role }) => [id, role])).toEqual([
      ["u1", "user"],
      ["a1", "assistant"],
      ["u2", "user"],
    ]);
  });

  it("gives a reused id a fresh one instead of overwriting history", () => {
    const next = appendIncoming(history, message("u1", "user", "Again"), options);
    expect(next.at(-1)).toMatchObject({ id: "fresh", metadata: { createdAt: options.createdAt } });
  });
});
