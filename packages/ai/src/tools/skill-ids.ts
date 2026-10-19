import { AVAILABLE_SKILLS, type SkillId } from "../skills/index.ts";

/** Historical IDs stay readable without advertising separate legacy skills. */
const aliases: Readonly<Record<string, SkillId>> = {
  simulation: "explainer",
  "sim-double-pendulum": "explainer-double-pendulum",
};
export function canonicalSkillId(id: string): SkillId | undefined {
  if (Object.hasOwn(aliases, id)) return aliases[id];
  return AVAILABLE_SKILLS.includes(id as SkillId) ? (id as SkillId) : undefined;
}
