/**
 * Ruth's skills: markdown instructions inlined into `skills.ts` by
 * `scripts/generator.ts`. The model pulls them into context on demand with the
 * `load_skill` tool, so the system prompt only carries their one-line catalog.
 */
import { SKILL_MAP, type SkillId } from "./skills.ts";

export {
  AVAILABLE_SKILLS,
  SKILL_MAP,
  type SkillDefinition,
  type SkillId,
  type SkillSection,
  STUDY_SKILLS,
  TOOL_SKILLS,
  VISUAL_EXAMPLE_SKILLS,
  VISUAL_SKILLS,
} from "./skills.ts";

/** The skills' content, deduplicated and in request order. */
export const loadSkills = (ids: ReadonlyArray<SkillId>): string =>
  [...new Set(ids)].map((id) => SKILL_MAP[id].content.trimEnd()).join("\n\n");

/** One line per skill, for the system prompt's catalog. */
export const describeSkills = (ids: ReadonlyArray<SkillId>): string =>
  ids.map((id) => `- \`${id}\`: ${SKILL_MAP[id].description ?? SKILL_MAP[id].title}`).join("\n");
