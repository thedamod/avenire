"use client";

import type { ThreadId } from "@avenire/contracts";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "~/features/chat/ChatView";

function Thread() {
  const { threadId } = useParams<{ threadId: string }>();
  const params = useSearchParams();
  const q = params.get("q");
  const files = params.get("files");
  const fast = params.get("fast") === "1";
  return (
    <ChatView
      key={threadId}
      threadId={decodeURIComponent(threadId) as ThreadId}
      {...(q ? { initialQuestion: q } : {})}
      {...(files ? { initialFiles: files.split(",").filter(Boolean) } : {})}
      {...(fast ? { initialFast: true } : {})}
    />
  );
}

export default function ThreadPage() {
  return (
    <Suspense>
      <Thread />
    </Suspense>
  );
}
