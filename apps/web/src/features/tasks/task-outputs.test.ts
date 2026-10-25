import { describe, expect, it } from "vite-plus/test";
import { readTaskOutputs, writeTaskOutputs } from "./task-outputs";

describe("scheduled task output choices", () => {
  it("round trips choices through the saved task prompt", () => {
    const saved = writeTaskOutputs("Use the wording in my notes.", ["Summary", "Quiz"]);
    expect(saved).toBe("Use the wording in my notes.\n\nRequested outputs: Summary, Quiz.");
    expect(readTaskOutputs(saved)).toEqual({
      instructions: "Use the wording in my notes.",
      outputs: ["Summary", "Quiz"],
    });
  });
  it("preserves legacy instructions and unrecognized output text", () => {
    for (const prompt of [
      "Make a diagram.",
      "Notes\n\nRequested outputs: Essay.",
      "Requested outputs: Summary.\nKeep this text.",
    ]) {
      expect(readTaskOutputs(prompt)).toEqual({ instructions: prompt, outputs: [] });
    }
  });
  it("can remove choices on edit without leaving the old request in the prompt", () => {
    const parsed = readTaskOutputs("Use my notes.\n\nRequested outputs: Quiz.");
    expect(writeTaskOutputs(parsed.instructions, [])).toBe("Use my notes.");
  });
  it("supports a task whose brief is entirely output choices", () => {
    expect(readTaskOutputs(writeTaskOutputs("", ["Diagram"]))).toEqual({
      instructions: "",
      outputs: ["Diagram"],
    });
  });
});
