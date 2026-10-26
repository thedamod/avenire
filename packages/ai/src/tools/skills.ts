import { tool } from "ai";
import * as Effect from "effect/Effect";

import { loadSkills, type SkillId } from "../skills/index.ts";
import { canonicalSkillId } from "./skill-ids.ts";
import { RuthToolError } from "./core.ts";
import { loadSkillSpec } from "./index.ts";
import { registerTool } from "./registration.ts";

const loadRequestedSkills = Effect.fn("RuthKit.loadSkill")(function* ({
  skills,
}: typeof loadSkillSpec.inputSchema.Type) {
  const ids = skills.map(canonicalSkillId);
  if (ids.some((id) => id === undefined))
    return yield* new RuthToolError({
      tool: "load_skill",
      code: "invalid_input",
      message: "Unknown skill ID. Use the available skill catalog.",
      recoverable: true,
    });
  const requested = [...new Set(ids as SkillId[])];
  return { skills: requested, content: loadSkills(requested) };
});

export const loadSkillRegistration = registerTool({
  spec: { name: "load_skill", ...loadSkillSpec },
  policy: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  execute: loadRequestedSkills,
});

/** `load_skill`: returns the requested skills' markdown into the model's context. */
export const loadSkillTool = () =>
  tool({
    ...loadSkillSpec,
    execute: (input) => Effect.runPromise(loadRequestedSkills(input)),
  });
