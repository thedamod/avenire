export const TASK_OUTPUTS = [
  "Summary",
  "Quiz",
  "Revision",
  "Widget",
  "Animation",
  "Diagram",
] as const;
export type TaskOutput = (typeof TASK_OUTPUTS)[number];
const PREFIX = "Requested outputs: ";

/** Keep output choices in the existing prompt contract, including when editing a saved task. */
export function readTaskOutputs(prompt: string) {
  const match = prompt.match(/(?:^|\n\n)Requested outputs: ([^\n]+)\.$/);
  if (!match) return { instructions: prompt, outputs: [] as TaskOutput[] };
  const labels = match[1]!.split(", ");
  if (!labels.every((label) => TASK_OUTPUTS.includes(label as TaskOutput))) {
    return { instructions: prompt, outputs: [] as TaskOutput[] };
  }
  return {
    instructions: prompt.slice(0, match.index).trimEnd(),
    outputs: labels as TaskOutput[],
  };
}

export function writeTaskOutputs(instructions: string, outputs: readonly TaskOutput[]) {
  return [instructions.trim(), outputs.length ? `${PREFIX}${outputs.join(", ")}.` : ""]
    .filter(Boolean)
    .join("\n\n");
}
