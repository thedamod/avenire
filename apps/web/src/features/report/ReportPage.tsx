"use client";

import {
  PendingApprovalId,
  type CloudRun,
  type CloudRunId,
  type FolderId,
  type ThreadId,
} from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@avenire/ui/components/sheet";
import { cn } from "@avenire/ui/lib/utils";
import { AlertCircle, ChevronRight, PanelRight } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { toast } from "sonner";

import { PageHeader } from "~/components/app";
import { draftChat, threadChat, type ThreadChat } from "~/features/chat/chatStore";
import { ChatComposer, type ComposerSubmission } from "~/features/chat/composer/ChatComposer";
import { scopeWith } from "~/features/chat/composer/CompactComposer";
import { useKeyboardInset } from "~/features/chat/composer/useKeyboardInset";
import { collectCitations } from "~/features/chat/logic/citations";
import { pendingRequests, type PendingApproval } from "~/features/chat/logic/requests";
import { createRowsDeriver } from "~/features/chat/logic/rows";
import { combineRunActivity } from "~/features/chat/logic/workGroups";
import type { ChatRow, DeriveRowsInput, MediaItem } from "~/features/chat/logic/types";
import { ChatMarkdown, CitationContext } from "~/features/chat/markdown/Markdown";
import { measurePage, useWidgetTheme } from "~/features/chat/pageContext";
import { Elapsed, formatDuration } from "~/features/chat/timeline/Elapsed";
import { MessagesTimeline } from "~/features/chat/timeline/MessagesTimeline";
import { TimelineContext, type TimelineActions } from "~/features/chat/timeline/TimelineRows";
import { ApprovalTray, ErrorTray, QuestionTray } from "~/features/chat/tray/RequestTray";
import { useLibraryIndex } from "~/features/chat/useLibraryIndex";
import { useThreadChat } from "~/features/chat/useThreadChat";
import { SourceViewer } from "~/features/sources/SourceViewer";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { useIsMobile } from "~/lib/responsive";

import { FileChangesTray } from "./FileChangesTray.tsx";
import {
  clockTime,
  fileChanges,
  followUps,
  isJsonOutput,
  mainTab,
  outputTabs,
  reportDate,
  reportNotebook,
  startHere,
  tabLabel,
  type FileChange,
  type OutputTab,
} from "./logic/report.ts";
import { OutputPane, TabIcon, type PaneData } from "./OutputPane.tsx";
import {
  ReportContext,
  citationFromClick,
  type CitationRequest,
  type ReportActions,
} from "./ReportContext.ts";
import { useQuizFiles, useRunReport } from "./useReport.ts";
import { useDocumentTitle } from "~/lib/document-title";

type Report = ReturnType<typeof useRunReport>;

/** Thread length when this page first sent a follow-up for a run (see `followUps`). */
const sentFromByRun = new Map<string, number>();

/** `/report/[runId]`: the morning report workspace (08, 08b, 16a–c / M12–M17). */
export function ReportPage({ runId }: { readonly runId: CloudRunId }) {
  const report = useRunReport(runId);
  const threads = useQuery((client) => client["ruth.listThreads"](), "report-threads");
  const cloudThread = threads.data?.find((thread) => thread.kind === "ruth-cloud");
  const run = report.run.data;

  if (report.run.error && !run)
    return (
      <div className="flex h-dvh flex-col">
        <PageHeader crumbs={[{ label: "Morning report" }]} />
        <div className="mx-auto flex w-full max-w-[46rem] flex-col items-start gap-2 px-5 pt-10 md:px-0">
          <p className="text-[13.5px] text-foreground-soft">
            Couldn't open this report.{" "}
            <span className="text-muted-foreground">{errorMessage(report.run.error)}</span>
          </p>
          <Link href="/tasks" className="text-[13px] text-foreground-soft hover:text-foreground">
            See Chats and Tasks
          </Link>
        </div>
      </div>
    );
  if (!run || (!threads.data && !threads.error)) return <ReportSkeleton />;
  // Follow-ups go to the user's Ruth Cloud thread; it exists once a first run has reported.
  return (
    <ReportWorkspace
      key={cloudThread?.id ?? "draft"}
      report={report}
      run={run}
      cloudThreadId={cloudThread?.id}
    />
  );
}

function ReportWorkspace({
  report,
  run,
  cloudThreadId,
}: {
  readonly report: Report;
  readonly run: CloudRun;
  readonly cloudThreadId: ThreadId | undefined;
}) {
  const api = useApi();
  const phone = useIsMobile();
  const library = useLibraryIndex();
  const keyboardInset = useKeyboardInset();
  const { colorScheme, tokens } = useWidgetTheme();
  const runId = run.id;
  const { stream, products, phase } = report;

  // --- Follow-up chat --------------------------------------------------------------------
  const [entry] = useState<ThreadChat>(() =>
    cloudThreadId ? threadChat(api, cloudThreadId) : draftChat(api),
  );
  const chat = useThreadChat(entry);
  useEffect(() => {
    entry.hydrate().catch((cause: unknown) => toast.error(errorMessage(cause)));
  }, [entry]);
  const measureTarget = useRef<HTMLDivElement>(null);
  entry.measure = () => measurePage(measureTarget.current);
  const [sentFrom, setSentFrom] = useState(() => sentFromByRun.get(runId) ?? null);
  const follow = useMemo(
    () =>
      cloudThreadId
        ? followUps(chat.messages, runId, sentFrom, run.reportMessageId)
        : chat.messages,
    [chat.messages, cloudThreadId, runId, sentFrom, run.reportMessageId],
  );
  const followLive = follow.length > 0 && follow.at(-1) === chat.messages.at(-1);
  const followStatus = followLive ? chat.status : "ready";
  const followError = followLive && chat.error ? errorMessage(chat.error) : null;

  // --- Rows ------------------------------------------------------------------------------
  const [workExpanded, setWorkExpanded] = useState<ReadonlyMap<string, boolean>>(
    () => new Map([[runId, true]]),
  );
  const runDeriver = useMemo(createRowsDeriver, []);
  const followDeriver = useMemo(createRowsDeriver, []);
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : null;
  const runInput = useMemo<DeriveRowsInput>(
    () => ({
      messages: stream.messages,
      status: stream.status,
      workExpanded,
      timings: NO_TIMINGS,
      turnStartedAt: startedAt,
      error: stream.error ? stream.error.message : null,
    }),
    [stream.messages, stream.status, stream.error, workExpanded, startedAt],
  );
  const followInput = useMemo<DeriveRowsInput>(
    () => ({
      messages: follow,
      status: followStatus,
      workExpanded,
      timings: chat.timings,
      turnStartedAt: chat.turnStartedAt,
      error: followError,
    }),
    [follow, followStatus, workExpanded, chat.timings, chat.turnStartedAt, followError],
  );
  const runRows = runDeriver(runInput);
  const followRows = followDeriver(followInput);
  const widgetAssets = useMemo(
    () => run.assets.filter((asset) => asset.kind === "widget"),
    [run.assets],
  );
  const rows = useMemo(() => {
    // The run's own log: actions and figures; the header and Ruth's thinking stay out of it.
    const log = combineRunActivity(
      runRows.filter(
        (row) => row.kind !== "work-header" && row.kind !== "reasoning" && row.kind !== "user",
      ),
    );
    const shown = new Set(
      log.flatMap((row) =>
        row.kind === "media"
          ? row.items.map((item) => (item.kind === "widget" ? item.url : ""))
          : [],
      ),
    );
    let figures = log.reduce(
      (sum, row) =>
        sum + (row.kind === "media" ? row.items.filter((item) => "figure" in item).length : 0),
      0,
    );
    const items: MediaItem[] = widgetAssets
      .filter((asset) => !shown.has(asset.url))
      .map((asset) => ({
        kind: "widget",
        id: asset.id,
        url: asset.url,
        title: asset.title,
        figure: ++figures,
      }));
    const assetRow: ChatRow[] = items.length
      ? [
          {
            kind: "media",
            id: `assets:${runId}`,
            messageId: runId,
            items,
            sig: JSON.stringify(items),
          },
        ]
      : [];
    return [...log, ...assetRow, ...followRows];
  }, [runRows, followRows, widgetAssets, runId]);

  const citations = useMemo(
    () => collectCitations([...stream.messages, ...follow]),
    [stream.messages, follow],
  );
  const timeline = useMemo<TimelineActions>(
    () => ({
      toggleWork: (messageId, expanded) =>
        setWorkExpanded((current) => new Map(current).set(messageId, expanded)),
      colorScheme,
      themeTokens: tokens,
    }),
    [colorScheme, tokens],
  );

  // --- Outputs ---------------------------------------------------------------------------
  const jsonOutputs = useMemo(
    () =>
      products.published
        .filter((output) => {
          const file = library.fileById.get(output.fileId);
          return isJsonOutput({
            title: file?.title ?? output.title,
            mimeType: file?.mimeType ?? null,
          });
        })
        .map((output) => output.fileId),
    [products.published, library.fileById],
  );
  const quizzes = useQuizFiles(jsonOutputs);
  const quizFlags = useMemo(
    () => new Map([...quizzes].map(([id, quiz]) => [id, quiz !== null] as const)),
    [quizzes],
  );
  const [opened, setOpened] = useState<Extract<OutputTab, { kind: "source" }>[]>([]);
  const tabs = useMemo(
    () =>
      outputTabs({
        products,
        fileById: library.fileById,
        assets: run.assets,
        quizzes: quizFlags,
        opened,
      }),
    [products, library.fileById, run.assets, quizFlags, opened],
  );
  const main = useMemo(
    () => mainTab(tabs.filter((tab) => !(tab.kind === "source" && tab.transient))),
    [tabs],
  );
  const [activeKey, setActiveKey] = useState<string>();
  const active = activeKey && tabs.some((tab) => tab.key === activeKey) ? activeKey : main?.key;
  const pointer = useMemo(
    () => run.startHere ?? startHere(run.summary),
    [run.startHere, run.summary],
  );
  const paneData = useMemo<PaneData>(
    () => ({
      fileById: library.fileById,
      folderById: library.folderById,
      quizzes,
      mainKey: main?.key,
      startHere: pointer,
      sources: products.hydrated.length,
    }),
    [library.fileById, library.folderById, quizzes, main?.key, pointer, products.hydrated.length],
  );

  const [paneChoice, setPaneChoice] = useState<boolean | null>(null);
  const paneOpen = paneChoice ?? tabs.length > 0;
  const [paneFull, setPaneFull] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [citation, setCitation] = useState<CitationRequest | null>(null);

  const openTab = useCallback(
    (key: string) => {
      setActiveKey(key);
      if (phone) setSheetOpen(true);
      else setPaneChoice(true);
    },
    [phone],
  );

  const openCitation = useCallback(
    (request: CitationRequest) => {
      // On a phone, a citation from the thread opens a half sheet; inside the outputs sheet it
      // becomes a tab there.
      if (phone && !sheetOpen) {
        setCitation(request);
        return;
      }
      const file = library.fileById.get(request.fileId);
      const title = file?.title ?? request.title ?? "Source";
      setOpened((current) => [
        ...current.filter((tab) => tab.fileId !== request.fileId),
        {
          kind: "source",
          key: `cite:${request.fileId}`,
          fileId: request.fileId,
          title,
          label: tabLabel(title),
          target: request.target,
          transient: true,
        },
      ]);
      const existing = tabs.find(
        (tab) => tab.kind === "source" && tab.fileId === request.fileId && !tab.transient,
      );
      setActiveKey(existing?.key ?? `cite:${request.fileId}`);
      setPaneChoice(true);
    },
    [library.fileById, phone, sheetOpen, tabs],
  );
  const onCiteClick = useCallback(
    (event: MouseEvent) => {
      const request = citationFromClick(event);
      if (request) openCitation(request);
    },
    [openCitation],
  );
  const closeTab = useCallback((key: string) => {
    setOpened((current) => current.filter((tab) => tab.key !== key));
    setActiveKey((current) => (current === key ? undefined : current));
  }, []);

  // --- Approvals -------------------------------------------------------------------------
  const [decided, setDecided] = useState<ReadonlyMap<string, "accepted" | "skipped">>(new Map());
  const [deciding, setDeciding] = useState<ReadonlySet<string>>(new Set());
  const changes = useMemo(
    () =>
      fileChanges({
        proposals: products.proposals,
        open: report.approvals.data,
        decided,
        fileById: library.fileById,
      }),
    [products.proposals, report.approvals.data, decided, library.fileById],
  );
  const { refetch: refetchApprovals } = report.approvals;
  const settle = useCallback(
    (resolved: readonly { id: string; status: string; conflict: string | null }[]) => {
      setDecided((current) => {
        const next = new Map(current);
        for (const approval of resolved)
          if (approval.status === "accepted" || approval.status === "skipped")
            next.set(approval.id, approval.status);
        return next;
      });
      const conflict = resolved.find((approval) => approval.status === "conflict");
      if (conflict) toast.error(conflict.conflict ?? "This file changed since Ruth read it.");
      void refetchApprovals();
      invalidateLibrary(api, ["files", "notes"]);
    },
    [api, refetchApprovals],
  );
  const decide = useCallback(
    async (change: FileChange, decision: "accept" | "skip") => {
      setDeciding((current) => new Set(current).add(change.approvalId));
      try {
        const approval = await call(api, (client) =>
          client["cloud.resolveApproval"]({
            approvalId: PendingApprovalId.make(change.approvalId),
            decision,
          }),
        );
        settle([approval]);
      } catch (cause) {
        toast.error(errorMessage(cause));
      } finally {
        setDeciding((current) => {
          const next = new Set(current);
          next.delete(change.approvalId);
          return next;
        });
      }
    },
    [api, settle],
  );
  const decideAll = useCallback(
    async (decision: "accept" | "skip") => {
      const ids = changes.rows.map((row) => row.approvalId);
      setDeciding(new Set(ids));
      try {
        settle(await call(api, (client) => client["cloud.resolveRun"]({ runId, decision })));
      } catch (cause) {
        toast.error(errorMessage(cause));
      } finally {
        setDeciding(new Set());
      }
    },
    [api, changes.rows, runId, settle],
  );
  // Once the last waiting change is decided the tray goes; say what happened.
  const waitingBefore = useRef(changes.waiting);
  useEffect(() => {
    const before = waitingBefore.current;
    waitingBefore.current = changes.waiting;
    if (before > 0 && changes.waiting === 0 && decided.size > 0)
      toast.success(
        `All changes reviewed · ${[
          changes.accepted ? `${changes.accepted} accepted` : null,
          changes.skipped ? `${changes.skipped} skipped` : null,
        ]
          .filter(Boolean)
          .join(", ")}`,
      );
  }, [changes.waiting, changes.accepted, changes.skipped, decided.size]);

  // --- Composer --------------------------------------------------------------------------
  const notebook = useMemo(
    () =>
      (run.folderId ? library.folderById.get(run.folderId) : undefined) ??
      reportNotebook(products, library.fileById, library.folderById),
    [run.folderId, products, library.fileById, library.folderById],
  );
  const [folderId, setFolderId] = useState<FolderId | null>(null);
  const folderTouched = useRef(false);
  useEffect(() => {
    if (!folderTouched.current && notebook) setFolderId(notebook.id);
  }, [notebook]);
  const [fast, setFast] = useState(entry.fast);
  const [followSignal, setFollowSignal] = useState(0);

  const send = useCallback(
    async ({ text, references }: ComposerSubmission) => {
      entry.scope = scopeWith(folderId ? { folderIds: [folderId] } : {}, references);
      entry.fast = fast;
      if (cloudThreadId && !sentFromByRun.has(runId)) {
        sentFromByRun.set(runId, entry.chat.messages.length);
        setSentFrom(entry.chat.messages.length);
      }
      setFollowSignal((value) => value + 1);
      void entry
        .ensureThread(text, folderId)
        .then(() =>
          entry.chat.sendMessage({
            text,
            metadata: {
              createdAt: new Date().toISOString(),
              runId,
              references: references.map(({ kind, id }) => ({ kind, id })),
            },
          }),
        )
        .catch((cause: unknown) => toast.error(`Couldn't reach Ruth: ${errorMessage(cause)}`));
    },
    [cloudThreadId, entry, fast, folderId, runId],
  );
  const actions = useMemo<ReportActions>(
    () => ({
      openCitation,
      askRuth: (text) => {
        if (phone) setSheetOpen(false);
        else setPaneFull(false);
        void send({ text, references: [] });
      },
      runId,
    }),
    [openCitation, phone, runId, send],
  );

  const busy = followStatus === "submitted" || followStatus === "streaming";
  const requests = useMemo(() => pendingRequests(follow), [follow]);
  const question = requests.questions[0];
  const fail = (cause: unknown) => toast.error(errorMessage(cause));
  const decideChat = (approvals: readonly PendingApproval[], approved: boolean) => {
    for (const approval of approvals) void entry.approve(approval.approvalId, approved).catch(fail);
  };
  const tray = question ? (
    <QuestionTray
      questions={requests.questions}
      onAnswer={(item, answers) => void entry.answer(item.toolCallId, answers).catch(fail)}
      onSkip={(item) =>
        void entry.answer(item.toolCallId, ["(The user skipped this question.)"]).catch(fail)
      }
    />
  ) : requests.approvalGroups.length ? (
    <ApprovalTray
      groups={requests.approvalGroups}
      library={library}
      onDecide={decideChat}
      onAlwaysAllow={(group) => decideChat(group, true)}
      onCancel={() => {
        for (const group of requests.approvalGroups) decideChat(group, false);
      }}
    />
  ) : followStatus === "error" && followError ? (
    <ErrorTray
      message={followError}
      onRetry={() => void entry.chat.regenerate().catch(fail)}
      onDismiss={() => entry.chat.clearError()}
    />
  ) : changes.waiting > 0 ? (
    <FileChangesTray
      changes={changes}
      busy={deciding}
      onDecide={(change, decision) => void decide(change, decision)}
      onDecideAll={(decision) => void decideAll(decision)}
    />
  ) : null;

  const dock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(140);
  useLayoutEffect(() => {
    const element = dock.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setDockHeight(Math.round(element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // --- Header ----------------------------------------------------------------------------
  const date = reportDate(run.finishedAt ?? run.startedAt ?? run.scheduledFor);
  useDocumentTitle(`Morning report · ${date}`);
  const intro = (
    <RunIntro
      run={run}
      phase={phase ?? "running"}
      expanded={workExpanded.get(runId) ?? true}
      onToggle={() =>
        setWorkExpanded((current) => new Map(current).set(runId, !(current.get(runId) ?? true)))
      }
      tabs={tabs}
      paneData={paneData}
      activeKey={main?.key}
      onOpenTab={openTab}
      hasLog={rows.length > 0}
    />
  );

  return (
    <ReportContext.Provider value={actions}>
      <CitationContext.Provider value={citations}>
        <TimelineContext.Provider value={timeline}>
          <div className="flex h-dvh overflow-hidden bg-background">
            <section
              className={cn(
                "relative flex min-w-0 flex-1 flex-col",
                paneFull && paneOpen && !phone && "hidden",
              )}
            >
              <PageHeader
                crumbs={[
                  ...(notebook
                    ? [
                        {
                          label: notebook.name,
                          href: `/notebooks/${notebook.id}`,
                          color: notebook.color,
                        },
                      ]
                    : []),
                  { label: `Morning report · ${date}` },
                ]}
                title="Morning report"
                subtitle={notebook ? `${notebook.name} · ${date}` : date}
                status={
                  phase === "failed" ? (
                    <span className="text-muted-foreground">Didn't finish</span>
                  ) : undefined
                }
                actions={
                  tabs.length
                    ? [
                        {
                          label: "Show outputs",
                          icon: PanelRight,
                          pinned: true,
                          onSelect: () => (phone ? setSheetOpen(true) : setPaneChoice(true)),
                        },
                      ]
                    : []
                }
              />
              <main className="relative min-h-0 flex-1" onClickCapture={onCiteClick}>
                <MessagesTimeline
                  rows={rows}
                  threadKey={`report:${runId}`}
                  bottomInset={dockHeight + keyboardInset}
                  followSignal={followSignal}
                  header={intro}
                  startAtTop
                />
                <div
                  ref={dock}
                  style={{ bottom: keyboardInset }}
                  className="pointer-events-none absolute inset-x-0 z-20 bg-[linear-gradient(180deg,rgba(11,11,11,0)_0%,rgba(11,11,11,0.94)_30%,#0B0B0B_100%)] px-3 pt-7 pb-[max(env(safe-area-inset-bottom),12px)] md:bg-none md:px-6 md:pt-0 md:pb-5"
                >
                  <div
                    ref={measureTarget}
                    className="pointer-events-auto mx-auto w-full max-w-[46rem]"
                  >
                    <ChatComposer
                      draftKey={`report:${runId}`}
                      placeholder={
                        question?.allowCustom
                          ? "Or type your own answer"
                          : "Ask Ruth, @ a source or note, or / for commands"
                      }
                      busy={busy && !question}
                      onStop={() => void entry.chat.stop()}
                      disabled={!chat.hydrated}
                      folderId={folderId}
                      onFolderChange={(value) => {
                        folderTouched.current = true;
                        setFolderId(value);
                      }}
                      fast={fast}
                      onFastChange={setFast}
                      tray={tray}
                      onSubmit={(submission) => {
                        if (question)
                          return entry.answer(question.toolCallId, [submission.text]).then(
                            () => true,
                            (cause: unknown) => {
                              fail(cause);
                              return false;
                            },
                          );
                        return send(submission);
                      }}
                    />
                  </div>
                </div>
              </main>
            </section>

            {!phone && paneOpen && tabs.length ? (
              <aside
                aria-label="Made overnight"
                onClickCapture={onCiteClick}
                className={cn(
                  "flex min-w-0 flex-col border-l border-border bg-card",
                  paneFull ? "flex-1" : "w-[clamp(26rem,39vw,40rem)] shrink-0",
                )}
              >
                <OutputPane
                  variant="pane"
                  tabs={tabs}
                  activeKey={active}
                  onSelect={setActiveKey}
                  onCloseTab={closeTab}
                  expanded={paneFull}
                  onToggleExpanded={() => setPaneFull((value) => !value)}
                  onClosePane={() => {
                    setPaneFull(false);
                    setPaneChoice(false);
                  }}
                  data={paneData}
                />
              </aside>
            ) : null}

            {phone ? (
              <>
                <Sheet open={sheetOpen && tabs.length > 0} onOpenChange={setSheetOpen}>
                  <SheetContent
                    side="bottom"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onClickCapture={onCiteClick}
                    className="h-[calc(100dvh-56px)] max-h-none gap-0 bg-sheet"
                  >
                    <SheetTitle className="sr-only">Made overnight</SheetTitle>
                    <SheetDescription className="sr-only">
                      What Ruth made overnight
                    </SheetDescription>
                    <OutputPane
                      variant="sheet"
                      tabs={tabs}
                      activeKey={active}
                      onSelect={setActiveKey}
                      onCloseTab={closeTab}
                      data={paneData}
                    />
                  </SheetContent>
                </Sheet>
                <Sheet open={citation !== null} onOpenChange={(open) => !open && setCitation(null)}>
                  <SheetContent
                    side="bottom"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    className="h-[56dvh] gap-0 bg-sheet"
                  >
                    <SheetTitle className="truncate px-5 pt-2 pb-3 text-[15px]">
                      {citation
                        ? (library.fileById.get(citation.fileId)?.title ??
                          citation.title ??
                          "Source")
                        : "Source"}
                    </SheetTitle>
                    <SheetDescription className="sr-only">The cited passage</SheetDescription>
                    <ScrollFade className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
                      {citation ? (
                        <SourceViewer
                          fileId={citation.fileId}
                          page={citation.target.page}
                          t={citation.target.t}
                          region={citation.target.region}
                          q={citation.target.q}
                          compact
                        />
                      ) : null}
                    </ScrollFade>
                  </SheetContent>
                </Sheet>
              </>
            ) : null}
          </div>
        </TimelineContext.Provider>
      </CitationContext.Provider>
    </ReportContext.Provider>
  );
}

const NO_TIMINGS = new Map();

/** "Worked overnight for 14m 08s", Ruth's summary and (phone) the outputs row. */
function RunIntro({
  run,
  phase,
  expanded,
  onToggle,
  tabs,
  paneData,
  activeKey,
  onOpenTab,
  hasLog,
}: {
  readonly run: CloudRun;
  readonly phase: "running" | "done" | "failed" | "cancelled";
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly tabs: readonly OutputTab[];
  readonly paneData: PaneData;
  readonly activeKey: string | undefined;
  readonly onOpenTab: (key: string) => void;
  readonly hasLog: boolean;
}) {
  const started = run.startedAt ? Date.parse(run.startedAt) : null;
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : null;
  const running = phase === "running";
  const outputs = tabs.filter((tab) => !(tab.kind === "source" && tab.transient));
  return (
    <div className="mx-auto w-full max-w-[46rem] px-5 pt-3 pb-4 md:px-0 md:pt-5">
      <div className="mb-4 flex h-9 items-center gap-3 border-b border-input pb-2.5 text-[14px]">
        {running ? (
          <span className="flex items-center gap-1.5 text-foreground-soft">
            <span className="ruth-shimmer">
              {run.status === "running" ? "Working overnight" : "Getting ready"}
            </span>
            {started !== null ? (
              <span className="text-muted-foreground">
                <Elapsed since={started} />
              </span>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            disabled={!hasLog}
            onClick={onToggle}
            className="flex items-center gap-1.5 text-foreground-soft transition-colors hover:text-foreground disabled:hover:text-foreground-soft"
          >
            {started !== null && finished !== null
              ? `Worked overnight for ${formatDuration(finished - started)}`
              : phase === "cancelled"
                ? "Cancelled"
                : "Worked overnight"}
            {hasLog ? (
              <ChevronRight
                className={cn(
                  "size-3 text-muted-foreground transition-transform",
                  expanded && "rotate-90",
                )}
              />
            ) : null}
          </button>
        )}
        <span className="ml-auto text-[12.5px] text-muted-foreground">
          {run.finishedAt
            ? `${phase === "failed" ? "stopped" : "finished"} ${clockTime(run.finishedAt)}`
            : null}
        </span>
      </div>

      {phase === "failed" ? (
        <div className="mb-4 flex items-start gap-2.5 text-[13.5px] leading-5">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-foreground-soft">
            Ruth Cloud didn't finish this run.
            {run.error ? <span className="text-muted-foreground"> {run.error}</span> : null}{" "}
            <Link
              href={`/tasks/${run.taskId}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              Open the task
            </Link>
          </p>
        </div>
      ) : null}

      {run.summary ? (
        <ChatMarkdown text={run.summary} />
      ) : phase === "done" ? (
        <p className="text-[14px] text-muted-foreground">
          Ruth didn't leave a summary for this run.
        </p>
      ) : null}

      {outputs.length ? (
        <div className="mt-5 flex flex-col gap-2.5 md:hidden">
          <span className="text-[13px] text-foreground-soft">Made overnight</span>
          <ScrollFade
            axis="x"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {outputs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => onOpenTab(tab.key)}
                className={cn(
                  "motion-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13.5px] whitespace-nowrap",
                  tab.key === activeKey
                    ? "border-ruth-line bg-ruth-tint text-foreground"
                    : "border-input text-foreground-soft active:bg-hover",
                )}
              >
                <TabIcon tab={tab} main={tab.key === paneData.mainKey} data={paneData} />
                {tab.label}
              </button>
            ))}
          </ScrollFade>
        </div>
      ) : null}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div aria-label="Loading the morning report" className="flex h-dvh overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 max-md:h-[calc(52px+env(safe-area-inset-top))]" />
        <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 px-5 pt-5 md:px-0">
          <div className="h-6 w-48 animate-pulse rounded bg-white/[.04]" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-white/[.04]" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-white/[.04]" />
          </div>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-[22px] w-3/4 animate-pulse rounded bg-white/[.04]" />
          ))}
        </div>
      </div>
      <div className="w-[clamp(26rem,39vw,40rem)] shrink-0 border-l border-border bg-card max-md:hidden">
        <div className="flex h-[52px] items-center gap-2 px-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-8 w-20 animate-pulse rounded-lg bg-white/[.04]" />
          ))}
        </div>
        <div className="flex flex-col gap-3 px-7 pt-3">
          <div className="h-7 w-3/4 animate-pulse rounded bg-white/[.04]" />
          <div className="h-4 w-full animate-pulse rounded bg-white/[.04]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/[.04]" />
        </div>
      </div>
    </div>
  );
}
