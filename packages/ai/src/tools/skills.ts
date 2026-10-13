import { tool } from "ai";

import { loadSkills, type SkillId } from "../skills/index.ts";
import { canonicalSkillId } from "./skill-ids.ts";
import { RuthToolError } from "./core.ts";
import { loadSkillSpec } from "./index.ts";

/** `load_skill`: returns the requested skills' markdown into the model's context. */
export const loadSkillTool = () =>
  tool({
    ...loadSkillSpec,
    execute: ({ skills }) => {
      const ids = skills.map(canonicalSkillId);
      if (ids.some((id) => id === undefined))
        throw new RuthToolError({
          tool: "load_skill",
          code: "invalid_input",
          message: "Unknown skill ID. Use the available skill catalog.",
          recoverable: true,
        });
      const requested = [...new Set(ids as SkillId[])];
      return { skills: requested, content: loadSkills(requested) };
    },
  });
