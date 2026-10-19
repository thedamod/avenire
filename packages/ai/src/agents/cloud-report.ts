import type { HydratedFile } from "@avenire/contracts";
import type { CloudRunRow, CloudTaskRow } from "@avenire/database/schema";
import type { RuthUIMessage } from "../message-types.ts";

export interface ReportInput {
  readonly run: Pick<
    CloudRunRow,
    "id" | "status" | "startedAt" | "finishedAt" | "scheduledFor" | "attempt"
  >;
  readonly task: Pick<CloudTaskRow, "title" | "timeZone">;
  readonly hydrations: ReadonlyArray<{ readonly files: readonly HydratedFile[] }>;
  readonly produced: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly approvals: ReadonlyArray<{
    readonly fileTitle: string;
    readonly summary: string;
    readonly conflict: string | null;
  }>;
  readonly recording: { readonly id: string; readonly url: string } | null;
  readonly summary: string;
  readonly appUrl: string;
  readonly error?: string;
  readonly hydrationFailures?: ReadonlyArray<string>;
}
const label = (text: string) => text.replace(/[\\[\]`*<>]/g, "\\$&").replace(/\r?\n/g, " ");
export const readFiles = (hydrations: ReportInput["hydrations"]): readonly HydratedFile[] => [
  ...new Map(hydrations.flatMap(({ files }) => files).map((file) => [file.fileId, file])).values(),
];

/** The report is derived from audited inputs and published files, never guessed from sandbox files. */
export const buildReport = (input: ReportInput): string => {
  const base = input.appUrl.replace(/\/$/, "");
  const reads = readFiles(input.hydrations);
  return [
    `# ${label(input.task.title)}`,
    `Status: ${input.run.status} · attempt ${input.run.attempt}`,
    `Scheduled: ${input.run.scheduledFor.toISOString()} · time zone: ${input.task.timeZone}`,
    `Started: ${input.run.startedAt?.toISOString() ?? "Not started"}\nFinished: ${input.run.finishedAt?.toISOString() ?? "Not finished"}`,
    "## Ruth's summary",
    input.summary,
    `## Files read (${reads.length})`,
    ...(reads.length
      ? reads.map(
          (file) =>
            `- [${label(file.drivePath)}](${base}/library?file=${encodeURIComponent(file.fileId)}) — ${label(file.reason)}`,
        )
      : ["No files were hydrated."]),
    `## Files produced (${input.produced.length})`,
    ...(input.produced.length
      ? input.produced.map(
          (file) => `- [${label(file.title)}](${base}/library?file=${encodeURIComponent(file.id)})`,
        )
      : ["No files were published."]),
    "## Pending approvals",
    `${input.approvals.length} changes wait for your review. [Review changes](${base}/cloud/review?run=${encodeURIComponent(input.run.id)})`,
    ...input.approvals.map(
      (approval) =>
        `- ${label(approval.fileTitle)}: ${label(approval.summary)}${approval.conflict ? ` — Conflict: ${label(approval.conflict)}` : ""}`,
    ),
    ...(input.recording ? ["## Recording", `[Watch the session](${input.recording.url})`] : []),
    ...(input.error || input.hydrationFailures?.length
      ? [
          "## Failures",
          ...(input.error ? [input.error] : []),
          ...(input.hydrationFailures ?? []).map((reason) => `- Pre-hydration: ${reason}`),
        ]
      : []),
  ].join("\n\n");
};

export const reportMessage = (
  id: string,
  runId: string,
  text: string,
  createdAt: string,
): RuthUIMessage => ({
  id,
  role: "assistant",
  parts: [
    { type: "text", text },
    { type: "data-cloud-run", id: runId, data: { runId } },
  ],
  metadata: { createdAt },
});
