import type { Metadata } from "next";
import { Suspense } from "react";
import { TasksPage } from "~/features/tasks/TasksPage";

export const metadata: Metadata = { title: "Chats and Tasks" };

export default function Page() {
  return (
    <Suspense>
      <TasksPage />
    </Suspense>
  );
}
