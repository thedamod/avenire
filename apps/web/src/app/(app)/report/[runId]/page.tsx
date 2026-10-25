import type { Metadata } from "next";
import type { CloudRunId } from "@avenire/contracts";
import { ReportPage } from "~/features/report/ReportPage";

export const metadata: Metadata = { title: "Morning report" };

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <ReportPage key={runId} runId={decodeURIComponent(runId) as CloudRunId} />;
}
