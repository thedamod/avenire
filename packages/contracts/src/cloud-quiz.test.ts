import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { CloudQuiz } from "./cloud.ts";

const question = {
  id: "q1",
  topic: "free expansion",
  question: "What happens to entropy?",
  choices: ["Increases", "Decreases"],
  answer: 0,
  explanationTitle: "Entropy increases",
  explanation: "The accessible volume increases.",
  sources: [{ fileId: "lecture", page: 6 }],
};
const decode = (patch: Record<string, unknown>) =>
  Schema.decodeUnknownSync(CloudQuiz)({ title: "Entropy", questions: [{ ...question, ...patch }] });

describe("CloudQuiz", () => {
  it("accepts page, time and whole-file citations", () => {
    expect(
      decode({
        sources: [{ fileId: "lecture", page: 6 }, { fileId: "video", t: 0 }, { fileId: "note" }],
      }).questions,
    ).toHaveLength(1);
  });
  it("rejects malformed questions and out-of-range answers", () => {
    for (const patch of [
      { choices: ["Only one"] },
      { choices: Array(7).fill("Choice") },
      { answer: -1 },
      { answer: 2 },
      { answer: 0.5 },
      { topic: "" },
      { sources: [{ fileId: "lecture", page: 0 }] },
      { sources: [{ fileId: "lecture", t: -1 }] },
      { sources: [{ fileId: "lecture", page: 1, t: 10 }] },
    ])
      expect(() => decode(patch)).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(CloudQuiz)({ title: "Entropy", questions: [question, question] }),
    ).toThrow();
  });
});
