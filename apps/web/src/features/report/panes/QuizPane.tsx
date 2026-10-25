"use client";

import type { FileId, LibraryFile } from "@avenire/contracts";
import Link from "next/link";
import { Button } from "@avenire/ui/components/button";
import { cn } from "@avenire/ui/lib/utils";
import { Moon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { FileKindIcon } from "~/components/app";
import { formatTimestamp } from "~/features/chat/logic/citations";
import {
  LETTERS,
  NEW_PROGRESS,
  marks,
  score,
  verdict,
  type Mark,
  type Quiz,
  type QuizProgress,
  type QuizSource,
} from "../logic/quiz.ts";
import { sourceHref, useReport, type CitationRequest } from "../ReportContext.ts";

const storageKey = (runId: string, fileId: string) => `avenire.quiz.${runId}.${fileId}`;

/** Answers persist on this device per run, so the quiz survives a reload. */
function useProgress(runId: string, fileId: string) {
  // The pane is client-only and keyed per file, so the saved answers load on first render.
  const [progress, setProgress] = useState<QuizProgress>(() => {
    try {
      const saved = localStorage.getItem(storageKey(runId, fileId));
      if (saved) return { ...NEW_PROGRESS, ...(JSON.parse(saved) as QuizProgress) };
    } catch {
      // A broken entry starts the quiz over.
    }
    return NEW_PROGRESS;
  });
  const update = useCallback(
    (next: (current: QuizProgress) => QuizProgress) =>
      setProgress((current) => {
        const value = next(current);
        try {
          localStorage.setItem(storageKey(runId, fileId), JSON.stringify(value));
        } catch {
          // Private mode: progress lives for this visit only.
        }
        return value;
      }),
    [fileId, runId],
  );
  return [progress, update] as const;
}

export default function QuizPane({
  fileId,
  quiz,
  fileById,
  runId: runIdOverride,
  onAskRuth,
  onOpenCitation,
}: {
  readonly fileId: FileId;
  readonly quiz: Quiz | null | undefined;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly runId?: string;
  readonly onAskRuth?: (text: string) => void;
  readonly onOpenCitation?: (request: CitationRequest) => void;
}) {
  const { runId: reportRunId, openCitation: reportOpenCitation } = useReport();
  const runId = runIdOverride ?? reportRunId;
  const openCitation = onOpenCitation ?? (reportRunId ? reportOpenCitation : undefined);
  const [progress, setProgress] = useProgress(runId, fileId);
  if (quiz === undefined) return <QuizSkeleton />;
  if (quiz === null)
    return (
      <p className="px-5 pt-4 text-[13.5px] text-muted-foreground md:px-7">
        This quiz couldn't be read.
      </p>
    );
  const done = progress.current >= quiz.questions.length;
  return done ? (
    <QuizScore
      quiz={quiz}
      progress={progress}
      setProgress={setProgress}
      {...(onAskRuth ? { onAskRuth } : {})}
    />
  ) : (
    <QuizQuestionView
      quiz={quiz}
      progress={progress}
      setProgress={setProgress}
      fileById={fileById}
      {...(openCitation ? { onOpenCitation: openCitation } : {})}
    />
  );
}

type SetProgress = (next: (current: QuizProgress) => QuizProgress) => void;

const BAR: Record<Mark, string> = {
  correct: "bg-success",
  wrong: "bg-destructive",
  open: "bg-surface-6",
};

function ProgressBar({ marks: list, className }: { marks: readonly Mark[]; className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)} aria-hidden="true">
      {list.map((mark, index) => (
        <span key={index} className={cn("h-1 flex-1 rounded-full", BAR[mark])} />
      ))}
    </div>
  );
}

function QuizQuestionView({
  quiz,
  progress,
  setProgress,
  fileById,
  onOpenCitation,
}: {
  readonly quiz: Quiz;
  readonly progress: QuizProgress;
  readonly setProgress: SetProgress;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly onOpenCitation?: (request: CitationRequest) => void;
}) {
  const index = progress.current;
  const item = quiz.questions[index]!;
  const chosen = progress.answers[item.id];
  const answered = chosen !== undefined;
  const all = marks(quiz, progress);
  const tally = score(quiz, progress);
  const last = index === quiz.questions.length - 1;

  const choose = (choice: number) => {
    if (answered) return;
    setProgress((current) => ({
      ...current,
      startedAt: current.startedAt ?? Date.now(),
      answers: { ...current.answers, [item.id]: choice },
    }));
  };
  const next = () =>
    setProgress((current) => {
      // After "Retry missed", skip past questions that are already right.
      let target = current.current + 1;
      while (
        target < quiz.questions.length &&
        current.answers[quiz.questions[target]!.id] !== undefined
      )
        target++;
      return {
        ...current,
        current: target,
        finishedAt: target >= quiz.questions.length ? Date.now() : current.finishedAt,
      };
    });

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-4 px-5 pt-2 md:px-7 md:pt-4">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="shrink-0 text-foreground-soft">
            Question {index + 1} of {quiz.questions.length}
          </span>
          <ProgressBar marks={all} className="max-w-[13rem] flex-1" />
          <span className="ml-auto shrink-0 font-mono text-[12px] text-foreground-soft tabular-nums">
            {tally.correct} / {tally.answered}
          </span>
        </div>
        <h2 className="text-[21px] leading-[28px] font-semibold text-balance md:text-[18px] md:leading-[27px]">
          {item.question}
        </h2>
        <ol className="flex flex-col max-md:-mx-5 max-md:divide-y max-md:divide-border max-md:border-y max-md:border-border md:gap-2">
          {item.choices.map((choice, choiceIndex) => {
            const isAnswer = choiceIndex === item.answer;
            const isChosen = choiceIndex === chosen;
            const state = !answered ? "open" : isAnswer ? "correct" : isChosen ? "wrong" : "muted";
            return (
              <li key={choiceIndex}>
                <button
                  type="button"
                  disabled={answered}
                  onClick={() => choose(choiceIndex)}
                  className={cn(
                    "flex min-h-[56px] w-full items-center gap-4 px-5 py-3 text-left text-[15.5px] leading-[22px] transition-colors md:min-h-[46px] md:rounded-lg md:border md:px-4 md:py-2.5 md:text-[14px] md:leading-5",
                    state === "open" && "border-input hover:bg-hover",
                    state === "muted" && "border-input text-foreground-soft",
                    state === "correct" && "border-success/50 bg-success/[.07]",
                    state === "wrong" && "border-destructive/50 bg-destructive/[.08]",
                  )}
                >
                  <span className="w-3 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {LETTERS[choiceIndex]}
                  </span>
                  <span className="min-w-0 flex-1">{choice}</span>
                  {state === "correct" ? (
                    <span className="shrink-0 text-[12.5px] text-success">Correct</span>
                  ) : state === "wrong" ? (
                    <span className="shrink-0 text-[12.5px] text-destructive">Your answer</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
        {answered && (item.explanation || item.explanationTitle || item.sources.length) ? (
          <div className="flex flex-col gap-2 max-md:border-l-2 max-md:border-success max-md:pl-3.5 md:rounded-[10px] md:border md:border-input md:p-4">
            {item.explanationTitle ? (
              <p className="text-[15px] leading-5 font-semibold md:text-[13.5px]">
                {item.explanationTitle}
              </p>
            ) : null}
            {item.explanation ? (
              <p className="text-[14px] leading-[21px] text-foreground-soft md:text-[13px] md:leading-[21px]">
                {item.explanation}
              </p>
            ) : null}
            {item.sources.length ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.sources.map((source, sourceIndex) => (
                  <SourceChip
                    key={sourceIndex}
                    source={source}
                    fileById={fileById}
                    {...(onOpenCitation ? { onOpenCitation } : {})}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-auto flex items-center gap-4 border-border px-5 py-4 max-md:border-t md:mt-0 md:px-7 md:pt-5">
        <p className="min-w-0 flex-1 text-[12.5px] leading-[18px] text-muted-foreground">
          {answered && chosen !== item.answer
            ? "You can retry the ones you missed at the end."
            : answered
              ? null
              : "Pick an answer to see why."}
        </p>
        <Button
          size="lg"
          disabled={!answered}
          onClick={next}
          className="max-md:h-11 max-md:px-4 max-md:text-[15px]"
        >
          {last ? "See score" : "Next question"}
        </Button>
      </div>
    </div>
  );
}

function SourceChip({
  source,
  fileById,
  onOpenCitation,
}: {
  readonly source: QuizSource;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly onOpenCitation?: (request: CitationRequest) => void;
}) {
  const file = fileById.get(source.fileId as FileId);
  const where =
    source.t !== undefined ? formatTimestamp(source.t) : source.page ? `p.${source.page}` : null;
  const name =
    source.label ??
    (file?.title.replace(/\.(pdf|md)$/i, "").split(" · ")[0] || file?.title) ??
    "Source";
  const request: CitationRequest = {
    fileId: source.fileId as FileId,
    ...(file ? { title: file.title } : {}),
    target: {
      ...(source.page ? { page: source.page } : {}),
      ...(source.t !== undefined ? { t: source.t } : {}),
    },
  };
  const content = (
    <>
      {file ? <FileKindIcon kind={file.kind} url={file.sourceUrl} size={13} /> : null}
      <span className="truncate">{where && !source.label ? `${name} · ${where}` : name}</span>
    </>
  );
  return onOpenCitation ? (
    <button
      type="button"
      onClick={() => onOpenCitation(request)}
      className="inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-md border border-input px-2 text-xs text-foreground-soft transition-colors hover:text-foreground"
    >
      {content}
    </button>
  ) : (
    <Link
      href={sourceHref(request)}
      className="inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-md border border-input px-2 text-xs text-foreground-soft transition-colors hover:text-foreground"
    >
      {content}
    </Link>
  );
}

function QuizScore({
  quiz,
  progress,
  setProgress,
  onAskRuth,
}: {
  readonly quiz: Quiz;
  readonly progress: QuizProgress;
  readonly setProgress: SetProgress;
  readonly onAskRuth?: (text: string) => void;
}) {
  const { askRuth } = useReport();
  const ask = onAskRuth ?? askRuth;
  const all = marks(quiz, progress);
  const tally = score(quiz, progress);
  const missed = useMemo(
    () =>
      quiz.questions
        .map((item, index) => ({ item, index }))
        .filter(({ index }) => all[index] === "wrong"),
    [all, quiz.questions],
  );
  const minutes =
    progress.startedAt && progress.finishedAt
      ? Math.max(1, Math.round((progress.finishedAt - progress.startedAt) / 60_000))
      : null;
  const meta = [
    minutes ? `Finished in ${minutes} min` : null,
    progress.retried.length ? `${progress.retried.length} retried` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const retry = () =>
    setProgress((current) => {
      const answers = { ...current.answers };
      const ids = missed.map(({ item }) => item.id);
      for (const id of ids) delete answers[id];
      return {
        ...current,
        answers,
        current: missed[0]?.index ?? 0,
        finishedAt: null,
        retried: [...new Set([...current.retried, ...ids])],
      };
    });
  const restart = () => setProgress(() => NEW_PROGRESS);

  return (
    <div className="flex flex-col gap-5 px-5 pt-3 pb-10 md:px-7 md:pt-7">
      <div className="flex items-center gap-4">
        <span className="text-[52px] leading-none font-medium tracking-[-0.02em] tabular-nums">
          {tally.correct}/{tally.total}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[16px] leading-[21px] font-semibold md:text-[14px] md:leading-5">
            {verdict(quiz, progress)}
          </p>
          {meta ? <p className="text-[12.5px] text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
      <ProgressBar marks={all} />
      {missed.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] text-muted-foreground">Missed</h3>
          <ul className="flex flex-col divide-y divide-border border-y border-border md:rounded-[10px] md:border md:border-input md:divide-input">
            {missed.map(({ item, index }) => {
              const chosen = progress.answers[item.id];
              return (
                <li key={item.id} className="flex flex-col gap-1 py-3 md:px-4">
                  <span className="text-[15px] leading-5 md:text-[13.5px]">
                    Q{index + 1} · {capitalize(item.topic ?? item.question)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground md:text-[12.5px]">
                    {chosen !== undefined ? `You said “${item.choices[chosen]}”. ` : ""}
                    {item.explanationTitle ?? firstSentence(item.explanation)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="flex flex-col gap-3 border-l-2 border-ruth py-0.5 pl-3.5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ruth-text md:text-[13.5px]">
          <Moon className="size-3.5" />
          Ruth
        </p>
        <p className="text-[14px] leading-5 text-foreground-soft md:text-[13.5px]">
          {missed.length
            ? "Ask Ruth to go over what you missed, or try those questions again."
            : "Nothing missed. Ask Ruth for harder questions on the same material."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() =>
              ask(
                missed.length
                  ? `I took the quiz and missed ${missed
                      .map(({ item, index }) => `Q${index + 1} (${item.topic ?? item.question})`)
                      .join(", ")}. Walk me through what I got wrong.`
                  : "I got everything right on the quiz. Give me three harder questions on the same material.",
              )
            }
          >
            {missed.length ? "Go over what I missed" : "Ask for harder questions"}
          </Button>
          {missed.length ? (
            <Button variant="secondary" onClick={retry}>
              Retry missed
            </Button>
          ) : null}
          <Button variant="ghost" onClick={restart}>
            Start over
          </Button>
        </div>
      </div>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function firstSentence(value: string | null): string {
  if (!value) return "";
  return /^(.+?[.!?])(\s|$)/.exec(value)?.[1] ?? value;
}

export function QuizSkeleton() {
  return (
    <div aria-label="Loading quiz" className="flex flex-col gap-4 px-5 pt-2 md:px-7 md:pt-4">
      <div className="h-4 w-48 animate-pulse rounded bg-white/[.04]" />
      <div className="h-6 w-5/6 animate-pulse rounded bg-white/[.04]" />
      <div className="h-6 w-2/3 animate-pulse rounded bg-white/[.04]" />
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-[46px] animate-pulse rounded-lg bg-white/[.04]" />
      ))}
    </div>
  );
}
