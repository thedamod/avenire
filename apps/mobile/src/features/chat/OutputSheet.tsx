import { SheetError as ErrorState } from "./outputs/SheetError";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { ScreenProps } from "../../navigation";
import { colors } from "../../theme/tokens";
import { EmptyState, Screen, ScrollFade, SkeletonRow, errorMessage } from "../../ui";
import { rememberCitation, type Citation } from "./citations/model";
import { useOutputs, type OutputKind } from "./outputs/data";
import { OutputTabs, type SheetTab } from "./outputs/OutputTabs";
import { CitedMarkdown, NoteOutput } from "./outputs/NoteOutput";
import { QuizOutput } from "./outputs/QuizOutput";
import { WidgetOutput } from "./outputs/WidgetOutput";

export function OutputSheet({ route, navigation }: ScreenProps<"Output">) {
  const { threadId, output, id, runId } = route.params;
  const [selected, setSelected] = useState<OutputKind>(output);
  const [scrolled, setScrolled] = useState(false);
  const reduced = useReducedMotion();
  const outputs = useOutputs(threadId, id, output, runId);
  useEffect(() => {
    setSelected(output);
  }, [output, id]);
  useEffect(() => {
    navigation.setOptions({
      animation: reduced ? "none" : "slide_from_bottom",
      animationDuration: 250,
    });
  }, [navigation, reduced]);
  const data = outputs.data;
  const widget =
    (output === "widget" && id ? data?.widgets.find((item) => item.id === id) : undefined) ??
    data?.widgets[0];
  const file =
    selected === "summary"
      ? ((output === "summary" && id ? data?.notes.find((item) => item.id === id) : undefined) ??
        data?.summary)
      : selected === "revision"
        ? ((output === "revision" && id ? data?.notes.find((item) => item.id === id) : undefined) ??
          data?.revision)
        : ((output === "quiz" && id ? data?.quizzes.find((item) => item.id === id) : undefined) ??
          data?.quiz);
  const tabs: SheetTab[] = [
    { key: "summary", label: "Summary", icon: "doc" },
    { key: "quiz", label: "Quiz", icon: "quiz" },
    { key: "revision", label: "Revision", icon: "lines" },
    {
      key: "widget",
      label: widget?.title.replace(/\.(html?)$/i, "").split(" · ")[0] ?? "Widget",
      icon: "widget",
    },
    ...(data?.source
      ? [
          {
            key: "source",
            label: data.source.title.replace(/\.pdf$/i, "").split(" · ")[0]!,
            icon: data.source.kind === "video" ? ("video" as const) : ("doc" as const),
          },
        ]
      : []),
  ];
  const openCitation = (citation: Citation) => {
    rememberCitation(citation);
    const { sourceId, page, time, region } = citation;
    navigation.navigate("Citation", {
      sourceId,
      ...(page ? { page } : {}),
      ...(time !== undefined ? { time } : {}),
      ...(region ? { region } : {}),
    });
  };
  const ask = (q: string) => navigation.navigate("Chat", { threadId, q, ...(runId ? { runId } : {}) });
  const fallbackSummary = selected === "summary" && data?.run?.summary;
  let body;
  if (outputs.loading)
    body = (
      <>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </>
    );
  else if (outputs.error)
    body = (
      <View style={{ padding: 20 }}>
        <ErrorState message={errorMessage(outputs.error)} onRetry={() => void outputs.refetch()} />
      </View>
    );
  else if (selected === "widget" && widget)
    body = <WidgetOutput key={widget.id} asset={widget} onAsk={ask} />;
  else if (selected === "quiz" && file && data)
    body = (
      <QuizOutput
        key={file.id}
        fileId={file.id}
        threadId={threadId}
        runId={data.run?.id}
        fileById={data.fileById}
        onCitation={openCitation}
        onAsk={ask}
      />
    );
  else if ((file || fallbackSummary) && data)
    body = (
      <ScrollFade top={scrolled} color={colors.sheet}>
        <ScrollView
          key={`${selected}:${file?.id ?? "summary"}`}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 4)}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 32 }}
        >
          {file ? (
            <NoteOutput
              fileId={file.id}
              startHere={selected === "summary" ? data.run?.startHere : null}
              createdAt={file.createdAt}
              sourceCount={data.sourceCount}
              citations={data.citations}
              fileById={data.fileById}
              onCitation={openCitation}
              onOpenNote={(fileId) => navigation.navigate("Note", { fileId })}
            />
          ) : (
            <CitedMarkdown
              value={fallbackSummary || ""}
              citations={data.citations}
              fileById={data.fileById}
              onCitation={openCitation}
            />
          )}
        </ScrollView>
      </ScrollFade>
    );
  else
    body = (
      <EmptyState
        title={`No ${selected === "revision" ? "revision notes" : selected} yet`}
        description="Outputs appear here when Ava has made them."
        icon={selected === "widget" ? "widget" : "doc"}
      />
    );
  return (
    <Screen
      edges={["left", "right", "bottom"]}
      style={{ backgroundColor: selected === "widget" ? "#0E0E0E" : colors.sheet }}
    >
      <OutputTabs
        tabs={tabs}
        selected={selected}
        onClose={() => navigation.goBack()}
        onSelect={(key) => {
          if (key === "source" && data?.source)
            navigation.navigate("Citation", { sourceId: data.source.id });
          else if (["summary", "quiz", "revision", "widget"].includes(key)) {
            setSelected(key as OutputKind);
            setScrolled(false);
          }
        }}
      />
      {outputs.replayError ? (
        <View style={{ padding: 20 }}>
          <ErrorState
            message="The report's source references couldn't be loaded."
            onRetry={outputs.retryReplay}
          />
        </View>
      ) : null}
      {body}
    </Screen>
  );
}
