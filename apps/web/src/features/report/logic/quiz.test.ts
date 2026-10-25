import { describe, expect, it } from "vite-plus/test";

import { NEW_PROGRESS, parseQuiz, score, verdict } from "./quiz.ts";

const quiz = {
  title: "Entropy",
  questions: [
    {
      id: "q1",
      topic: "Carnot",
      question: "What caps a heat engine's efficiency?",
      choices: ["Friction", "1 − Tc/Th"],
      answer: 1,
      sources: [{ fileId: "lec8", page: 11 }],
    },
    {
      id: "q2",
      topic: "free expansion",
      question: "A gas expands freely. What happens to its entropy?",
      choices: ["A) It decreases", "B) It stays the same", "C) It increases"],
      answer: "C",
      explanation: "Use a reversible path.",
    },
  ],
};

describe("parseQuiz", () => {
  it("reads the documented shape", () => {
    const parsed = parseQuiz(quiz)!;
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[1]).toMatchObject({
      choices: ["It decreases", "It stays the same", "It increases"],
      answer: 2,
      explanation: "Use a reversible path.",
    });
    expect(parsed.questions[0]!.sources).toEqual([{ fileId: "lec8", page: 11 }]);
  });

  it("accepts aliases: options, correct flags, answer text, a bare array", () => {
    const parsed = parseQuiz([
      { prompt: "Pick B", options: [{ text: "A" }, { text: "B", correct: true }] },
      { stem: "Pick yes", options: ["no", "yes"], correctAnswer: "yes" },
    ])!;
    expect(parsed.questions.map((item) => item.answer)).toEqual([1, 1]);
  });

  it("rejects JSON that isn't a quiz", () => {
    expect(parseQuiz([{ front: "dS", back: "δQ/T" }])).toBeNull();
    expect(parseQuiz({ questions: [{ question: "Open?", answer: "free text" }] })).toBeNull();
    expect(parseQuiz("quiz")).toBeNull();
  });
});

describe("score and verdict", () => {
  it("names the solid and shaky topics", () => {
    const parsed = parseQuiz(quiz)!;
    const progress = { ...NEW_PROGRESS, answers: { q1: 1, q2: 1 } };
    expect(score(parsed, progress)).toEqual({ correct: 1, answered: 2, total: 2 });
    expect(verdict(parsed, progress)).toBe("Solid on Carnot. Shaky on free expansion.");
  });
});
