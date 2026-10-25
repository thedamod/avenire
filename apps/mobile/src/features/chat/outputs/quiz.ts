/**
 * Ruth Cloud's quiz output: a JSON file published with `publish_output` (the nightly digest
 * prompt asks for `quiz.json`). New outputs use the shared CloudQuiz contract; older files
 * also accept the documented shape and a few aliases, rejecting anything else (the file then shows
 * as a plain source instead of a quiz):
 *
 * ```json
 * {
 *   "title": "Entropy and the second law",
 *   "questions": [{
 *     "id": "q3",
 *     "topic": "free expansion",
 *     "question": "A gas expands freely into a vacuum. No heat flows in. What happens to its entropy?",
 *     "choices": ["It decreases…", "It stays the same, because Q = 0", "It increases by nR ln(V₂/V₁)", "…"],
 *     "answer": 2,
 *     "explanationTitle": "Q = 0 doesn't mean ΔS = 0",
 *     "explanation": "dS = δQ/T only holds along a reversible path…",
 *     "sources": [{ "fileId": "…", "page": 6 }, { "fileId": "…", "t": 1120 }]
 *   }]
 * }
 * ```
 *
 * `answer` is the 0-based index of the correct choice (a letter "C" or the choice's text also
 * work). Only multiple choice is supported.
 */

import { CloudQuiz } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

export interface QuizSource {
  readonly fileId: string;
  readonly page?: number;
  readonly t?: number;
  readonly label?: string;
}

export interface QuizQuestion {
  readonly id: string;
  readonly topic: string | null;
  readonly question: string;
  readonly choices: readonly string[];
  readonly answer: number;
  readonly explanationTitle: string | null;
  readonly explanation: string | null;
  readonly sources: readonly QuizSource[];
}

export interface Quiz {
  readonly title: string | null;
  readonly questions: readonly QuizQuestion[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function str(object: Json, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function choiceText(choice: unknown): string | null {
  if (typeof choice === "string") return choice.trim() || null;
  if (typeof choice === "number") return String(choice);
  if (isObject(choice)) return str(choice, "text", "label", "value", "choice");
  return null;
}

/** "A) It decreases" → "It decreases". */
const stripLetter = (choice: string) => choice.replace(/^\(?[A-Ha-h][).:]\s+/, "");

function answerIndex(raw: unknown, choices: readonly string[], original: unknown[]): number {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    if (raw >= 0 && raw < choices.length) return raw;
    return -1;
  }
  if (typeof raw === "string") {
    const value = raw.trim();
    if (/^[A-Ha-h]$/.test(value)) return value.toUpperCase().charCodeAt(0) - 65;
    if (/^\d+$/.test(value)) return Number(value) < choices.length ? Number(value) : -1;
    const lower = value.toLowerCase();
    return choices.findIndex((choice) => choice.toLowerCase() === lower);
  }
  // `choices: [{ text, correct: true }]`
  const flagged = original.findIndex((choice) => isObject(choice) && choice.correct === true);
  return flagged;
}

function sources(raw: unknown): QuizSource[] {
  if (!Array.isArray(raw)) return [];
  const out: QuizSource[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) out.push({ fileId: item.trim() });
    else if (isObject(item)) {
      const fileId = str(item, "fileId", "id", "sourceFileId");
      if (!fileId) continue;
      const page = item.page;
      const t = item.t ?? item.startSec ?? item.time;
      const label = str(item, "label", "title");
      out.push({
        fileId,
        ...(typeof page === "number" && page > 0 ? { page: Math.floor(page) } : {}),
        ...(typeof t === "number" && t >= 0 ? { t } : {}),
        ...(label ? { label } : {}),
      });
    }
  }
  return out;
}

function question(raw: unknown, index: number): QuizQuestion | null {
  if (!isObject(raw)) return null;
  const prompt = str(raw, "question", "prompt", "stem", "text");
  const original = raw.choices ?? raw.options ?? raw.answers;
  if (!prompt || !Array.isArray(original)) return null;
  const choices = original.map(choiceText);
  if (choices.length < 2 || choices.some((choice) => choice === null)) return null;
  const clean = (choices as string[]).map(stripLetter);
  const answer = answerIndex(
    raw.answer ?? raw.correct ?? raw.correctIndex ?? raw.answerIndex ?? raw.correctAnswer,
    clean,
    original,
  );
  if (answer < 0 || answer >= clean.length) return null;
  return {
    id: str(raw, "id") ?? `q${index + 1}`,
    topic: str(raw, "topic", "concept", "title"),
    question: prompt,
    choices: clean,
    answer,
    explanationTitle: str(raw, "explanationTitle", "takeaway"),
    explanation: str(raw, "explanation", "why", "rationale", "feedback"),
    sources: sources(raw.sources ?? raw.citations ?? raw.sourceFileIds),
  };
}

/** A quiz, or null when the JSON isn't one we can run. Questions that don't parse are dropped. */
export function parseQuiz(json: unknown): Quiz | null {
  const canonical = Schema.decodeUnknownResult(CloudQuiz)(json);
  if (Result.isSuccess(canonical)) return canonical.success;
  // Compatibility for already-published quizzes with aliases or missing optional UI fields.
  const root = Array.isArray(json) ? { questions: json } : json;
  if (!isObject(root)) return null;
  const list = root.questions ?? root.items ?? root.quiz;
  if (!Array.isArray(list)) return null;
  const questions = list
    .map((item, index) => question(item, index))
    .filter((item): item is QuizQuestion => item !== null);
  if (!questions.length) return null;
  if (new Set(questions.map((item) => item.id)).size !== questions.length) return null;
  return { title: str(root, "title", "name"), questions };
}

// --- Progress --------------------------------------------------------------------------------

export interface QuizProgress {
  /** Chosen index per question id. */
  readonly answers: Readonly<Record<string, number>>;
  /** Index of the question on screen; `questions.length` = the score screen. */
  readonly current: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /** Question ids answered again through "Retry missed". */
  readonly retried: readonly string[];
}

export const NEW_PROGRESS: QuizProgress = {
  answers: {},
  current: 0,
  startedAt: null,
  finishedAt: null,
  retried: [],
};

export type Mark = "correct" | "wrong" | "open";

export function marks(quiz: Quiz, progress: QuizProgress): Mark[] {
  return quiz.questions.map((item) => {
    const chosen = progress.answers[item.id];
    if (chosen === undefined) return "open";
    return chosen === item.answer ? "correct" : "wrong";
  });
}

export function score(quiz: Quiz, progress: QuizProgress) {
  const all = marks(quiz, progress);
  const correct = all.filter((mark) => mark === "correct").length;
  const answered = all.filter((mark) => mark !== "open").length;
  return { correct, answered, total: quiz.questions.length };
}

/** "Solid on Carnot. Shaky on free expansion." when questions carry topics. */
export function verdict(quiz: Quiz, progress: QuizProgress): string {
  const all = marks(quiz, progress);
  const right = quiz.questions.filter((_, index) => all[index] === "correct");
  const missed = quiz.questions.filter((_, index) => all[index] === "wrong");
  const topic = (items: readonly QuizQuestion[]) =>
    items.map((item) => item.topic).find((value): value is string => value !== null);
  if (!missed.length) return "All correct.";
  const solid = topic(right);
  const shaky = topic(missed);
  if (solid && shaky) return `Solid on ${solid}. Shaky on ${shaky}.`;
  if (shaky) return `Shaky on ${shaky}.`;
  return `${missed.length} to look at again.`;
}

export const LETTERS = "ABCDEFGH";
