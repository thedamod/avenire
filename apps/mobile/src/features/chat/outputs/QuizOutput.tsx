import { SheetError as ErrorState } from "./SheetError";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileId, LibraryFile, ThreadId } from "@avenire/contracts";
import * as SecureStore from "expo-secure-store";
import { Platform, ScrollView, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { authClient } from "../../../state/auth";
import { colors, motion } from "../../../theme/tokens";
import {
  Aside,
  Button,
  Icon,
  Pressable,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../../ui";
import { CitationChip } from "../citations/CitationChip";
import { type Citation } from "../citations/model";
import { useOutputJson } from "./data";
import {
  LETTERS,
  NEW_PROGRESS,
  marks,
  parseQuiz,
  score,
  verdict,
  type Quiz,
  type QuizProgress,
} from "./quiz";

const enter = FadeIn.duration(200)
  .easing(Easing.bezier(...motion.easing.out))
  .reduceMotion(ReduceMotion.System);
const exit = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

function readProgress(value: string | null, quiz: Quiz): QuizProgress {
  if (!value) return NEW_PROGRESS;
  try {
    const raw = JSON.parse(value) as Partial<QuizProgress>;
    const answers: Record<string, number> = {};
    for (const question of quiz.questions) {
      const answer = raw.answers?.[question.id];
      if (
        typeof answer === "number" &&
        Number.isInteger(answer) &&
        answer >= 0 &&
        answer < question.choices.length
      )
        answers[question.id] = answer;
    }
    // Never restore a score or advance past a question that has not been answered.
    const requested =
      typeof raw.current === "number" && Number.isInteger(raw.current)
        ? Math.max(0, Math.min(raw.current, quiz.questions.length))
        : 0;
    const firstUnanswered = quiz.questions.findIndex(
      (question, index) => index < requested && answers[question.id] === undefined,
    );
    return {
      answers,
      current: firstUnanswered >= 0 ? firstUnanswered : requested,
      startedAt:
        typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt) ? raw.startedAt : null,
      finishedAt:
        typeof raw.finishedAt === "number" && Number.isFinite(raw.finishedAt)
          ? raw.finishedAt
          : null,
      retried: Array.isArray(raw.retried)
        ? raw.retried.filter(
            (id) => typeof id === "string" && quiz.questions.some((question) => question.id === id),
          )
        : [],
    };
  } catch {
    return NEW_PROGRESS;
  }
}

/** Like web QuizPane, progress is per account/run/file on this device; no answer RPC exists. */
function useProgress(key: string, quiz: Quiz) {
  const [progress, setProgress] = useState(NEW_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const pending = useRef(Promise.resolve());
  const latest = useRef(progress);
  latest.current = progress;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const value =
          Platform.OS === "web"
            ? (globalThis.localStorage?.getItem(key) ?? null)
            : await SecureStore.getItemAsync(key);
        if (active) setProgress(readProgress(value, quiz));
      } catch (cause) {
        if (active) setError(cause);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [key, quiz]);
  const update = (fn: (current: QuizProgress) => QuizProgress) => {
    const next = fn(latest.current);
    latest.current = next;
    setProgress(next);
    pending.current = pending.current
      .then(async () => {
        const value = JSON.stringify(next);
        if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
        else await SecureStore.setItemAsync(key, value);
        setError(undefined);
      })
      .catch(setError);
  };
  return { progress, update, loading, error, retrySave: () => update((current) => current) };
}

export function QuizOutput({
  fileId,
  threadId,
  runId,
  fileById,
  onCitation,
  onAsk,
}: {
  fileId: FileId;
  threadId: ThreadId;
  runId?: string | undefined;
  fileById: ReadonlyMap<FileId, LibraryFile>;
  onCitation: (citation: Citation) => void;
  onAsk: (text: string) => void;
}) {
  const json = useOutputJson(fileId);
  const quiz = useMemo(() => parseQuiz(json.data), [json.data]);
  if (json.loading)
    return (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  if (json.error || !quiz)
    return (
      <View style={{ padding: 20 }}>
        <ErrorState
          message={json.error ? errorMessage(json.error) : "This quiz couldn't be read."}
          onRetry={() => void json.refetch()}
        />
      </View>
    );
  return (
    <QuizSession
      key={`${runId ?? threadId}.${fileId}`}
      quiz={quiz}
      fileId={fileId}
      sessionId={runId ?? threadId}
      fileById={fileById}
      onCitation={onCitation}
      onAsk={onAsk}
    />
  );
}

function Progress({ quiz, progress }: { quiz: Quiz; progress: QuizProgress }) {
  return (
    <View
      accessibilityLabel={`${score(quiz, progress).correct} correct of ${quiz.questions.length}`}
      style={{ flexDirection: "row", gap: 4, flex: 1 }}
    >
      {marks(quiz, progress).map((mark, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor:
              mark === "correct" ? colors.green : mark === "wrong" ? colors.red : "#3A3A3A",
          }}
        />
      ))}
    </View>
  );
}

function QuizSession({
  quiz,
  fileId,
  sessionId,
  fileById,
  onCitation,
  onAsk,
}: {
  quiz: Quiz;
  fileId: FileId;
  sessionId: string;
  fileById: ReadonlyMap<FileId, LibraryFile>;
  onCitation: (citation: Citation) => void;
  onAsk: (text: string) => void;
}) {
  const { data: session } = authClient.useSession();
  const store = useProgress(
    `avenire.quiz.${session?.user.id ?? "signed-out"}.${sessionId}.${fileId}`,
    quiz,
  );
  const { progress, update } = store;
  const scroll = useRef<ScrollView>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    setScrolled(false);
  }, [progress.current]);
  if (store.loading)
    return (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  const done = progress.current >= quiz.questions.length;
  const question = quiz.questions[progress.current];
  const chosen = question ? progress.answers[question.id] : undefined;
  const tally = score(quiz, progress);
  const missed = quiz.questions
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        progress.answers[item.id] !== undefined && progress.answers[item.id] !== item.answer,
    );
  const ask = () =>
    onAsk(
      missed.length
        ? `I took the quiz and missed ${missed.map(({ item, index }) => `Q${index + 1} (${item.topic ?? item.question})`).join(", ")}. Walk me through what I got wrong.`
        : "I got everything right on the quiz. Give me three harder questions on the same material.",
    );
  return (
    <View style={{ flex: 1 }}>
      <ScrollFade top={scrolled} color={colors.sheet}>
        <ScrollView
          ref={scroll}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 4)}
          scrollEventThrottle={32}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: done ? 14 : 8,
            paddingBottom: 24,
            gap: done ? 14 : 12,
          }}
        >
          {store.error ? (
            <ErrorState
              message="Quiz progress couldn't be saved on this device."
              onRetry={store.retrySave}
            />
          ) : null}
          {done ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <Text
                  style={{
                    fontSize: 60,
                    lineHeight: 64,
                    letterSpacing: -2.4,
                    fontWeight: "500",
                    color: colors.fg,
                  }}
                >
                  {tally.correct}/{tally.total}
                </Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="section">{verdict(quiz, progress)}</Text>
                  <Text variant="meta">
                    {[
                      progress.startedAt && progress.finishedAt
                        ? `Finished in ${Math.max(1, Math.round((progress.finishedAt - progress.startedAt) / 60000))} min`
                        : null,
                      progress.retried.length ? `${progress.retried.length} retried` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </View>
              <Progress quiz={quiz} progress={progress} />
              {missed.length ? (
                <>
                  <Text variant="meta" style={{ fontSize: 13, paddingTop: 8 }}>
                    Missed
                  </Text>
                  <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
                    {missed.map(({ item, index }) => (
                      <View
                        key={item.id}
                        style={{
                          gap: 3,
                          paddingVertical: 12,
                          borderTopWidth: 1,
                          borderTopColor: colors.line,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            lineHeight: 20,
                            fontWeight: "500",
                            color: colors.fg,
                          }}
                        >
                          Q{index + 1} · {item.topic ?? item.question}
                        </Text>
                        <Text style={{ fontSize: 13, lineHeight: 18 }}>
                          You said “{item.choices[progress.answers[item.id]!]}”.{" "}
                          {item.explanationTitle ?? item.explanation}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
              <View style={{ gap: 10, paddingTop: 8 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Icon name="moon" size={14} color={colors["accent-text"]} />
                  <Text color="accent-text" weight="600">
                    Ava suggests
                  </Text>
                </View>
                <Text style={{ fontSize: 15, lineHeight: 22, color: colors.fg }}>
                  {missed.length
                    ? "Ask Ava to go over what you missed, or try those questions again."
                    : "Nothing missed. Ask Ava for harder questions on the same material."}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    rowGap: 16,
                    flexWrap: "wrap",
                    paddingVertical: 6,
                  }}
                >
                  <Button
                    accessibilityLabel={
                      missed.length
                        ? "Go over what I missed with Ava"
                        : "Ask Ava for harder questions"
                    }
                    hitSlop={6}
                    onPress={ask}
                  >
                    {missed.length ? "Go over what I missed" : "Ask for harder questions"}
                  </Button>
                  {missed.length ? (
                    <Button
                      variant="ghost"
                      accessibilityLabel="Retry missed questions"
                      hitSlop={6}
                      onPress={() =>
                        update((current) => {
                          const answers = { ...current.answers };
                          for (const { item } of missed) delete answers[item.id];
                          return {
                            ...current,
                            answers,
                            current: missed[0]!.index,
                            finishedAt: null,
                            retried: [
                              ...new Set([
                                ...current.retried,
                                ...missed.map(({ item }) => item.id),
                              ]),
                            ],
                          };
                        })
                      }
                    >
                      Retry missed
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    accessibilityLabel="Start quiz over"
                    hitSlop={6}
                    onPress={() => update(() => NEW_PROGRESS)}
                  >
                    Start over
                  </Button>
                </View>
              </View>
            </>
          ) : question ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 13, lineHeight: 18 }}>
                  Question {progress.current + 1} of {quiz.questions.length}
                </Text>
                <Progress quiz={quiz} progress={progress} />
                <Text variant="mono" color="fg">
                  {tally.correct} / {tally.answered}
                </Text>
              </View>
              <Text
                accessibilityRole="header"
                style={{
                  fontSize: 19,
                  lineHeight: 25,
                  fontWeight: "600",
                  paddingTop: 4,
                  paddingBottom: 2,
                  color: colors.fg,
                }}
              >
                {question.question}
              </Text>
              <View
                accessibilityRole="radiogroup"
                style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}
              >
                {question.choices.map((choice, index) => {
                  const correct = chosen !== undefined && index === question.answer;
                  const wrong = chosen === index && !correct;
                  const signal = correct ? colors.green : wrong ? colors.red : colors["fg-3"];
                  return (
                    <Pressable
                      key={index}
                      accessibilityRole="radio"
                      accessibilityLabel={`${LETTERS[index]}. ${choice}${correct ? ". Correct" : wrong ? ". Your answer, incorrect" : ""}`}
                      accessibilityState={{
                        checked: chosen === index,
                        disabled: chosen !== undefined,
                      }}
                      disabled={chosen !== undefined}
                      disabledOpacity={1}
                      onPress={() =>
                        update((current) => ({
                          ...current,
                          startedAt: current.startedAt ?? Date.now(),
                          answers: { ...current.answers, [question.id]: index },
                        }))
                      }
                      style={{
                        minHeight: 52,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderTopWidth: 1,
                        borderTopColor: colors.line,
                        backgroundColor: correct ? "#0F1A14" : wrong ? "#1E1213" : "transparent",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Text variant="mono" style={{ width: 10, color: signal }}>
                        {LETTERS[index]}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 15,
                          lineHeight: 20,
                          fontWeight: correct || wrong ? "500" : "400",
                          color: colors.fg,
                        }}
                      >
                        {choice}
                      </Text>
                      {correct || wrong ? (
                        <Text
                          style={{ fontSize: 12, lineHeight: 16, color: signal, fontWeight: "500" }}
                        >
                          {correct ? "Correct" : "Your answer"}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {chosen !== undefined ? (
                <Animated.View
                  key={question.id}
                  entering={enter}
                  exiting={exit}
                  accessibilityLiveRegion="polite"
                >
                  <Aside color={colors.green} gap={8}>
                    {question.explanationTitle ? (
                      <Text variant="section">{question.explanationTitle}</Text>
                    ) : null}
                    {question.explanation ? (
                      <Text style={{ fontSize: 14, lineHeight: 20 }}>{question.explanation}</Text>
                    ) : null}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {question.sources.map((source, index) => {
                        const file = fileById.get(source.fileId as FileId);
                        const citation: Citation = {
                          key: `${question.id}-${index}`,
                          sourceId: source.fileId as FileId,
                          title: source.label ?? file?.title ?? "Source",
                          ...(source.page ? { page: source.page } : {}),
                          ...(source.t !== undefined ? { time: source.t } : {}),
                        };
                        return (
                          <CitationChip
                            key={citation.key}
                            citation={citation}
                            file={file}
                            onOpen={onCitation}
                          />
                        );
                      })}
                    </View>
                  </Aside>
                </Animated.View>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </ScrollFade>
      {!done && question ? (
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 18,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <Text variant="meta" style={{ flex: 1 }}>
            {chosen === undefined
              ? "Pick an answer to see why."
              : chosen !== question.answer
                ? "You can retry the ones you missed at the end."
                : ""}
          </Text>
          <Button
            accessibilityLabel={
              progress.current === quiz.questions.length - 1 ? "See quiz score" : "Next question"
            }
            hitSlop={6}
            disabled={chosen === undefined}
            onPress={() =>
              update((current) => {
                let next = current.current + 1;
                while (
                  next < quiz.questions.length &&
                  current.answers[quiz.questions[next]!.id] !== undefined
                )
                  next++;
                return {
                  ...current,
                  current: next,
                  finishedAt: next >= quiz.questions.length ? Date.now() : null,
                };
              })
            }
          >
            {progress.current === quiz.questions.length - 1 ? "See score" : "Next question"}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
