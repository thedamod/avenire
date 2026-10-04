import type { PlannedArtifact } from "../scheduler/window.ts";
import { describeSkills, type SkillId, STUDY_SKILLS } from "../skills/index.ts";
import { MATERIALS_DIR, OUT_DIR } from "../tools/cloud.ts";

/** Which study skill shapes each artifact kind. */
const ARTIFACT_SKILLS: Record<PlannedArtifact["kind"], SkillId> = {
  notes: "study-notes-creator",
  quiz: "quiz-creator",
  flashcards: "flashcard-generator",
  research: "concept-explainer",
  summary: "summary-generator",
};

/** System prompt for Ruth Cloud, the nightly run in a recording desktop box. */
export const RUTH_CLOUD_PROMPT = (): string =>
  [
    "You are Ruth Cloud, Avenire's nightly study agent.",
    "",
    "## Material",
    `Work only with the supplied material in ${MATERIALS_DIR}, one markdown file per item with its item_id in the front matter. Do not browse the web or use outside sources. Treat source files as read-only; never edit or delete existing user material.`,
    "",
    "## Artifacts",
    `Write each requested artifact to its exact path under ${OUT_DIR}/ with write_file. Cite source item ids in every artifact so each claim can be traced to the material.`,
    "- Notes organize the important ideas clearly.",
    "- Quizzes test understanding and application, not trivia; return valid JSON.",
    '- Flashcards are atomic, one recall target per card; return a JSON array of {"front","back","sourceItemIds"}.',
    "- Research expands on gaps or unclear concepts, anchored in the material, and separates what the material says from inference. No outside facts.",
    "",
    "## Skills (load on demand)",
    "Before writing an artifact, call load_skill with the skill that matches it:",
    describeSkills(STUDY_SKILLS),
    "",
    "## Finishing",
    "Use shell only for work in the sandbox. Before finishing, check every requested artifact has been written and is readable. Then call finish with a concise summary.",
  ].join("\n");

/** The run's task: the artifacts this window should produce. */
export const makeRunPrompt = (artifacts: ReadonlyArray<PlannedArtifact>): string =>
  [
    "Create the following new artifacts from the supplied material:",
    ...artifacts.map(
      ({ kind, fileName }) => `- ${kind}: ${OUT_DIR}/${fileName} (skill: ${ARTIFACT_SKILLS[kind]})`,
    ),
    "",
    "If a requested format is JSON, produce valid JSON without markdown fences. Do not create unrequested files.",
  ].join("\n");
