import { ThreadId, UserId } from "@avenire/contracts";
import { MockLanguageModelV4 } from "ai/test";
import * as Context from "effect/Context";
import { RuthModels } from "../models/index.ts";
import { ruthToolSpecs } from "../tools/index.ts";
import type { RuthToolServices } from "../tools/ruth.ts";
import { describe, expect, it } from "@effect/vitest";
import { appendIncoming, createRuthAgent } from "./ruth.ts";
import type { RuthUIMessage } from "../message-types.ts";
import { findVisuals } from "../tools/page.ts";

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

for (const fullAccess of [false, true]) {
  it(`uses shared approval policy ${fullAccess ? "with" : "without"} Full access`, () => {
    // Creating a toolset does not execute services; all live providers remain absent.
    const services = Context.empty() as Context.Context<RuthToolServices>;
    const agent = createRuthAgent({
      models: RuthModels.of({ languageModel: () => new MockLanguageModelV4() }),
      services,
      fullAccess,
      turn: {
        userId: UserId.make("user"),
        threadId: ThreadId.make("thread"),
        fullAccess,
        timeZone: "UTC",
        page: {
          surface: "chat",
          platform: "web",
          contentWidthPx: 480,
          colorScheme: "light",
          themeTokens: {},
          fonts: { body: "sans-serif", mono: "monospace" },
        },
        existingVisuals: [],
      },
    });
    for (const name of ["write_file", "move_file", "rename_file", "archive_file"]) {
      expect(agent.tools[name]?.needsApproval).toBe(!fullAccess);
      expect(agent.toolApproval[name]).toBe(fullAccess ? "approved" : undefined);
    }
    for (const name of [
      "render_widget",
      "sandbox_exec",
      "sandbox_write",
      "sandbox_read",
      "sandbox_download_artifact",
      "sandbox_close",
    ]) {
      expect(agent.tools[name]?.needsApproval).toBe(false);
      expect(agent.toolApproval[name]).toBeUndefined();
    }
    for (const name of ["run_python", "read_item", "propose_file_action"])
      expect(agent.tools).not.toHaveProperty(name);
    expect(Object.keys(agent.tools).sort()).toEqual(Object.keys(ruthToolSpecs).sort());
  });
}
