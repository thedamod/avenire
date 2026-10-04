import { tool } from "ai";

import { loadSkills } from "../skills/index.ts";
import { loadSkillSpec } from "./index.ts";

/** `load_skill`: returns the requested skills' markdown into the model's context. */
export const loadSkillTool = () =>
  tool({
    ...loadSkillSpec,
    execute: ({ skills }) => ({ skills: [...skills], content: loadSkills(skills) }),
  });
