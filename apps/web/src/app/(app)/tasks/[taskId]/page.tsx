import type { Metadata } from "next";
import type { CloudTaskId } from "@avenire/contracts";
import { TaskDetailPage } from "~/features/tasks/TaskDetailPage";

export const metadata: Metadata = { title: "Overnight task" };

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <TaskDetailPage taskId={decodeURIComponent(taskId) as CloudTaskId} />;
}
