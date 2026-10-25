import type { CloudRunId, FileId } from "@avenire/contracts";
import { call, invalidate } from "@avenire/client-runtime/rpc";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ScreenProps } from "../../navigation";
import { useApi } from "../../state/api";
import { Composer, EmptyState, ErrorState, errorMessage, GlassHeader, Icon, IconButton, Screen, SkeletonRow } from "../../ui";
import { ApprovalTray } from "./thread/ApprovalTray";
import type { Citation } from "./thread/citations";
import { latestRunId, useReport, useThread } from "./thread/data";
import { FileChangesTray } from "./thread/FileChangesTray";
import { MessageList, type ReportPresentation } from "./thread/MessageList";
import { QuestionTray } from "./thread/QuestionTray";
import { cloudChanges, liveChanges, reportOutputs, runDate, type FileChange, type OutputItem } from "./thread/report";
import { pendingRequests, type PendingApproval, type PendingQuestion } from "./thread/requests";
import { ErrorTray, ThreadTray, TrayButton, TrayRow } from "./thread/ThreadTray";
import { asToolPart, field, text, toolName } from "./thread/toolParts";

/** The composer wrapper's 8pt top padding plus the 16pt of tray that sits behind the composer. */
const TRAY_TUCK = 24;

export function ChatScreen(props: ScreenProps<"Chat">) {
  return <ChatThread key={props.route.params.threadId} {...props} />;
}

function ChatThread(props: ScreenProps<"Chat">) {
  const thread = useThread(props.route.params.threadId, props.route.params.q);
  const runId = thread.thread.data?.kind === "ruth-cloud" ? latestRunId(thread.messages) : undefined;
  return runId ? <ReportThread key={runId} {...props} thread={thread} runId={runId} /> : <ThreadScreen {...props} thread={thread} />;
}

type ThreadData = ReturnType<typeof useThread>;
type ReportData = ReturnType<typeof useReport>;

function ReportThread(props: ScreenProps<"Chat"> & { thread: ThreadData; runId: CloudRunId }) {
  const report = useReport(props.runId);
  return <ThreadScreen {...props} report={report} runId={props.runId} />;
}

function ThreadScreen({ navigation, route, thread, report, runId }: ScreenProps<"Chat"> & { thread: ThreadData; report?: ReportData; runId?: CloudRunId }) {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<unknown>();
  const [scrollVersion, setScrollVersion] = useState(0);
  const [trayHeight, setTrayHeight] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourceIds, setSourceIds] = useState<readonly FileId[]>([]);
  const files = thread.files.data ?? [];
  const folders = thread.folders.data ?? [];
  const pending = useMemo(() => pendingRequests(thread.messages), [thread.messages]);
  const question = pending.questions[0];
  const streaming = thread.status === "streaming" || thread.status === "submitted";
  const changes = useMemo(() => [...(report?.approvals.data ? cloudChanges(report.approvals.data) : []), ...liveChanges(thread.messages, files)], [report?.approvals.data, thread.messages, files]);
  // File changes get their own review tray; destructive actions stay in M22.
  const approvalGroups = pending.approvalGroups.filter((group) => group.some((approval) => !changes.some((change) => change.id === approval.approvalId)));
  const reportMessages = report?.stream.messages ?? [];
  const outputs = useMemo(() => {
    const fromTools = reportOutputs(report ? reportMessages : thread.messages, files, report?.run.data?.assets ?? []);
    const known = new Set(fromTools.map((item) => item.id));
    // The output notebook also supplies products when an old run log lacks tool results.
    for (const file of files) {
      if (!report?.run.data?.folderId || !file.folderIds.includes(report.run.data.folderId) || file.placement === "archived" || known.has(file.id)) continue;
      const kind = /quiz|questions|test yourself/i.test(file.title) && (file.mimeType === "application/json" || /\.json$/i.test(file.title)) ? "quiz" : file.kind === "note" ? /revision/i.test(file.title) ? "revision" : "summary" : null;
      if (kind) fromTools.push({ id: file.id, title: kind === "quiz" ? "Quiz" : kind === "revision" ? "Revision" : "Summary", output: kind, icon: kind === "quiz" ? "quiz" : kind === "revision" ? "lines" : "doc" });
    }
    return fromTools;
  }, [reportMessages, report?.run.data, thread.messages, files, Boolean(report)]);
  const followUps = useMemo(() => {
    if (!runId) return thread.messages;
    const marker = thread.messages.findIndex((message) => message.parts.some((part) => part.type === "data-cloud-run" && part.data.runId === runId));
    return thread.messages.filter((message, index) => !message.parts.some((part) => part.type === "data-cloud-run") && (message.metadata?.runId !== undefined ? message.metadata.runId === runId : index > marker));
  }, [thread.messages, runId]);
  const reportView: ReportPresentation | undefined = report?.run.data ? {
    run: report.run.data, messages: reportMessages, outputs, loading: report.stream.status === "streaming" || report.stream.status === "submitted",
    error: report.stream.error?.message ?? (report.approvals.error ? errorMessage(report.approvals.error) : undefined),
    retry: () => { void report.stream.resumeStream(); void report.approvals.refetch(); },
  } : undefined;
  const notebook = useMemo(() => {
    const direct = folders.find((folder) => folder.id === thread.thread.data?.folderId);
    if (direct) return direct;
    const counts = new Map<string, number>();
    for (const message of reportMessages) for (const part of message.parts) {
      const tool = asToolPart(part);
      if (!tool || toolName(tool) !== "hydrate_files") continue;
      const hydrated = field(tool.output, "files");
      if (!Array.isArray(hydrated)) continue;
      for (const raw of hydrated) for (const id of files.find((file) => file.id === text(raw, "fileId"))?.folderIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return folders.find((folder) => folder.id === best && folder.archivedAt === null);
  }, [folders, files, reportMessages, thread.thread.data?.folderId]);
  const title = report ? "Morning report" : thread.thread.data?.title ?? "Chat";
  const subtitle = [notebook?.name, report?.run.data ? runDate(report.run.data) : null].filter(Boolean).join(" · ") || undefined;
  const onCitation = useCallback((citation: Citation) => navigation.navigate("Citation", {
    sourceId: citation.fileId as FileId,
    ...(citation.startSec !== null ? { time: citation.startSec } : {}),
    ...(citation.page !== null ? { page: citation.page } : citation.slide !== null ? { page: citation.slide } : {}),
    ...(citation.region ? { region: citation.region } : {}),
  }), [navigation]);
  const onOutput = useCallback((output: OutputItem) => navigation.navigate("Output", { threadId: route.params.threadId, output: output.output, id: output.id }), [navigation, route.params.threadId]);
  const handle = (action: () => PromiseLike<void> | void) => { setSendError(undefined); void Promise.resolve().then(action).catch(setSendError); };
  const approve = async (group: readonly PendingApproval[], approved: boolean) => {
    for (const item of group) await thread.act(`approval:${item.approvalId}`, () => thread.addToolApprovalResponse({ id: item.approvalId, approved }));
  };
  const alwaysAllow = async (group: readonly PendingApproval[]) => {
    await call(api, (client) => client["ruth.setFullAccess"]({ threadId: route.params.threadId, enabled: true }));
    await thread.thread.refetch();
    await approve(group, true);
  };
  const answer = async (question: PendingQuestion, answers: readonly string[]) => {
    await thread.act(`question:${question.toolCallId}`, () => thread.addToolOutput({ tool: "ask_user", toolCallId: question.toolCallId, output: { answers: [...answers] } }));
  };
  const decide = async (change: FileChange, decision: "accept" | "skip") => {
    if (change.transport === "cloud" && report) await thread.act(`cloud:${change.id}`, () => report.decide(change.id, decision));
    else await thread.act(`approval:${change.id}`, () => thread.addToolApprovalResponse({ id: change.id, approved: decision === "accept" }));
    invalidate(api, ["files", "folders"]);
  };
  const decideAll = async (decision: "accept" | "skip") => {
    for (const change of changes) if (change.status === "pending" || (decision === "skip" && change.status === "conflict")) await decide(change, decision);
  };
  const send = async (value: string) => {
    if (thread.pending || streaming) return;
    setSendError(undefined);
    if (question) await answer(question, [value]);
    else await thread.send(value, { ...(runId ? { runId } : {}), references: sourceIds.map((id) => ({ kind: "file", id })) });
    setDraft(""); setSourceIds([]); setSourcesOpen(false); setScrollVersion((value) => value + 1);
  };
  let tray;
  let errorInTray = false;
  if (question) tray = <QuestionTray key={question.toolCallId} question={question} total={pending.questions.length} busy={thread.pending} onAnswer={(answers) => handle(() => answer(question, answers))} onSkip={() => handle(() => answer(question, ["Skip"]))} />;
  else if (approvalGroups.length) tray = <ApprovalTray key={approvalGroups[0]?.[0]?.approvalId} groups={approvalGroups} files={files} folders={folders} busy={thread.pending} onDecide={(group, approved) => handle(() => approve(group, approved))} onAlwaysAllow={(group) => handle(() => alwaysAllow(group))} onCancel={() => handle(async () => { for (const group of approvalGroups) await approve(group, false); })} />;
  else if (sourcesOpen || sourceIds.length) tray = <ThreadTray title={sourceIds.length ? `${sourceIds.length} ${sourceIds.length === 1 ? "source" : "sources"} attached` : "Add a source"} meta="Use your library in this reply" expanded={sourcesOpen} onToggle={() => setSourcesOpen(!sourcesOpen)} footer={<><TrayButton variant="ghost" onPress={() => setSourceIds([])}>Clear</TrayButton><View style={{ flex: 1 }} /><TrayButton onPress={() => setSourcesOpen(false)}>Done</TrayButton></>}>
    {thread.files.loading ? <SkeletonRow /> : thread.files.error ? <ErrorState message={errorMessage(thread.files.error)} onRetry={() => { void thread.files.refetch(); }} /> : !files.length ? <EmptyState title="Your material starts here" description="Capture on your computer. Everything syncs here." icon="laptop" /> : files.filter((file) => file.placement !== "archived").map((file) => <TrayRow key={file.id} title={file.title} selected={sourceIds.includes(file.id)} onPress={() => setSourceIds((ids) => ids.includes(file.id) ? ids.filter((id) => id !== file.id) : [...ids, file.id])} leading={<Icon name={file.kind === "video" ? "video" : file.kind === "image" ? "image" : "doc"} size={14} />} trailing={sourceIds.includes(file.id) ? <Icon name="check" /> : undefined} />)}
  </ThreadTray>;
  else if (changes.length) tray = <FileChangesTray changes={changes} busy={thread.pending} onDecide={(change, decision) => handle(() => decide(change, decision))} onDecideAll={(decision) => handle(() => decideAll(decision))} />;
  else if (thread.status === "error" && thread.error) { errorInTray = true; tray = <ErrorTray message={errorMessage(thread.error)} onRetry={() => handle(() => thread.regenerate())} onDismiss={() => thread.clearError()} />; }
  const queryError = thread.hydrationError ?? thread.thread.error ?? report?.run.error;
  const error = queryError ?? (errorInTray ? undefined : thread.error) ?? thread.actionError ?? sendError;
  const retry = () => { setSendError(undefined); thread.clearActionError(); void thread.reload(); void thread.thread.refetch(); if (report) void report.run.refetch(); if (thread.status === "error") handle(() => thread.regenerate()); };
  return <Screen edges={["top", "left", "right"]}>
    <GlassHeader title={title} {...(subtitle ? { subtitle } : {})} onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Home")}
      trailing={outputs.length ? [{ icon: "panel", accessibilityLabel: "Open outputs", onPress: () => onOutput(outputs[0]!) }] : []} />
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 52} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <MessageList messages={followUps} status={thread.status} loading={!thread.ready && !thread.hydrationError || Boolean(report?.run.loading && !report.run.data)} error={error ? errorMessage(error) : undefined} onRetry={retry} onCitation={onCitation} onOutput={onOutput} timings={thread.entry.timing.turns} startedAt={thread.entry.timing.startedAt} report={reportView} scrollVersion={scrollVersion} bottomInset={tray ? Math.max(0, trayHeight - TRAY_TUCK) + 8 : 0} />
        {/* Floats over the thread so opening it never shifts the messages; its bottom is tucked behind the composer like desktop's ComposerTray. */}
        {tray ? <View pointerEvents="box-none" onLayout={(event) => setTrayHeight(event.nativeEvent.layout.height)} style={{ position: "absolute", left: 12, right: 12, bottom: -TRAY_TUCK }}>{tray}</View> : null}
      </View>
      <View style={{ paddingBottom: Math.max(insets.bottom, 12), paddingTop: 8 }}>
        <Composer floating={false} value={draft} onChangeText={setDraft} onSend={(value) => handle(() => send(value))} onAdd={() => setSourcesOpen(!sourcesOpen)}
          placeholder={question ? question.allowCustom ? "Or type your own answer" : "Choose an answer above" : "Ask Ruth, @ a source or note"}
          disabled={!thread.ready || thread.pending || Boolean(question && !question.allowCustom)} sending={streaming} controls={[]}
          trailing={streaming ? <IconButton icon="pause" size={34} hitSlop={5} accessibilityLabel="Stop Ruth's reply" onPress={() => handle(() => thread.stop())} /> : undefined} />
      </View>
    </KeyboardAvoidingView>
  </Screen>;
}
