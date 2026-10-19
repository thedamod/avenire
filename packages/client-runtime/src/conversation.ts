import type { PageContext, ThreadId } from "@avenire/contracts";

/** Platform-independent ownership of the selected thread, history and once-only decisions. */
export class ConversationSession<Message> {
  threadId: ThreadId | undefined;
  messages: Message[] = [];
  ready = false;
  draft = "";
  pageContext: (() => PageContext | undefined) | undefined;
  private adapter: unknown;
  private release: (() => void) | undefined;

  retain<Adapter>(create: () => Adapter, release?: (adapter: Adapter) => void): Adapter {
    if (!this.adapter) {
      const adapter = create();
      this.adapter = adapter;
      this.release = () => release?.(adapter);
    }
    return this.adapter as Adapter;
  }

  dispose(): void {
    this.release?.();
    this.adapter = undefined;
    this.messages = [];
    this.draft = "";
    this.threadId = undefined;
    this.ready = false;
    this.decisions.clear();
  }
  private hydration: Promise<void> | undefined;
  private creating: Promise<ThreadId> | undefined;
  private sending = false;
  private readonly decisions = new Set<string>();

  hydrate(
    load: (selected: ThreadId | undefined) => Promise<{ threadId?: ThreadId; messages: Message[] }>,
  ): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (!this.hydration) {
      this.hydration = load(this.threadId)
        .then((saved) => {
          this.threadId = saved.threadId;
          this.messages = saved.messages;
          this.ready = true;
        })
        .finally(() => {
          this.hydration = undefined;
        });
    }
    return this.hydration;
  }

  async ensureThread(create: () => Promise<ThreadId>): Promise<ThreadId> {
    await this.hydration;
    if (!this.ready) throw new Error("Conversation history is not ready. Please retry.");
    if (this.threadId) return this.threadId;
    if (!this.creating)
      this.creating = create()
        .then((id) => {
          this.threadId = id;
          return id;
        })
        .finally(() => {
          this.creating = undefined;
        });
    return this.creating;
  }

  async send(action: () => Promise<void>): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      await action();
    } finally {
      this.sending = false;
    }
  }

  async respondOnce(key: string, action: () => PromiseLike<void> | void): Promise<void> {
    if (this.decisions.has(key)) return;
    this.decisions.add(key);
    try {
      await action();
    } catch (error) {
      this.decisions.delete(key);
      throw error;
    }
  }
}

const sessions = new WeakMap<object, ConversationSession<unknown>>();
/** Sessions are scoped to an authenticated runtime, never to a module-wide user id. */
export function conversationSession<Message>(runtime: object): ConversationSession<Message> {
  let session = sessions.get(runtime);
  if (!session) sessions.set(runtime, (session = new ConversationSession<unknown>()));
  return session as ConversationSession<Message>;
}

export function questionAnswer(toolCallId: string, answer: string) {
  const clean = answer.trim();
  if (!clean) throw new Error("Enter an answer.");
  return { tool: "ask_user" as const, toolCallId, output: { answers: [clean] } };
}

/** Call when the authenticated runtime is disposed or its owner changes. */
export function disposeConversation(runtime: object): void {
  sessions.get(runtime)?.dispose();
  sessions.delete(runtime);
}
