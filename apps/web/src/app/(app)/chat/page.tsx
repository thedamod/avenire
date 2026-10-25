"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "~/features/chat/ChatView";

function NewChat() {
  const params = useSearchParams();
  const q = params.get("q");
  const files = params.get("files");
  const fast = params.get("fast") === "1";
  return (
    <ChatView
      {...(q ? { initialQuestion: q } : {})}
      {...(files ? { initialFiles: files.split(",").filter(Boolean) } : {})}
      {...(fast ? { initialFast: true } : {})}
    />
  );
}

/** New chat: the thread is created on the first send. */
export default function NewChatPage() {
  return (
    <Suspense>
      <NewChat />
    </Suspense>
  );
}
