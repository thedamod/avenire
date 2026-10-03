import type {
  Approval,
  ApprovalId,
  Message,
  MessageId,
  MessagePart,
  RuthEvent,
  ThreadId,
} from "@avenire/contracts";

export interface DraftMessage {
  readonly id: MessageId;
  readonly parts: ReadonlyArray<MessagePart>;
}

export interface RuthState {
  readonly messages: ReadonlyArray<Message>;
  readonly drafts: ReadonlyMap<MessageId, DraftMessage>;
  readonly pendingApprovals: ReadonlyMap<ApprovalId, Approval>;
  readonly threadId: ThreadId | undefined;
  readonly error: string | undefined;
}

export type RuthAction =
  | { readonly type: "event"; readonly event: RuthEvent }
  | { readonly type: "history-loaded"; readonly messages: ReadonlyArray<Message> }
  | { readonly type: "approval-decided"; readonly approvalId: ApprovalId }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "clear-error" };

export const initialRuthState: RuthState = {
  messages: [],
  drafts: new Map(),
  pendingApprovals: new Map(),
  threadId: undefined,
  error: undefined,
};

function ensureDraft(
  drafts: ReadonlyMap<MessageId, DraftMessage>,
  messageId: MessageId,
): DraftMessage {
  return drafts.get(messageId) ?? { id: messageId, parts: [] };
}

function appendTextPart(parts: ReadonlyArray<MessagePart>, delta: string): ReadonlyArray<MessagePart> {
  const last = parts.at(-1);
  if (last?._tag === "text") {
    return [...parts.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...parts, { _tag: "text", text: delta, citations: [] }];
}

export function ruthReducer(state: RuthState, action: RuthAction): RuthState {
  if (action.type === "history-loaded") {
    return {
      ...state,
      messages: action.messages,
      threadId: state.threadId ?? action.messages[0]?.threadId,
      drafts: new Map(),
    };
  }
  if (action.type === "approval-decided") {
    const pendingApprovals = new Map(state.pendingApprovals);
    pendingApprovals.delete(action.approvalId);
    return { ...state, pendingApprovals };
  }
  if (action.type === "error") return { ...state, error: action.message };
  if (action.type === "clear-error") return { ...state, error: undefined };

  const { event } = action;
  if (event._tag === "approval-requested") {
    const pendingApprovals = new Map(state.pendingApprovals);
    pendingApprovals.set(event.approval.id, event.approval);
    return { ...state, pendingApprovals, error: undefined };
  }

  if (event._tag === "message-completed") {
    const messages = state.messages.filter((message) => message.id !== event.message.id);
    const drafts = new Map(state.drafts);
    drafts.delete(event.message.id);
    return {
      ...state,
      messages: [...messages, event.message],
      drafts,
      threadId: state.threadId ?? event.message.threadId,
      error: undefined,
    };
  }

  const drafts = new Map(state.drafts);
  if (event._tag === "message-started") {
    drafts.set(event.messageId, ensureDraft(drafts, event.messageId));
  } else if (event._tag === "text-delta") {
    const draft = ensureDraft(drafts, event.messageId);
    drafts.set(event.messageId, { ...draft, parts: appendTextPart(draft.parts, event.delta) });
  } else if (event._tag === "part") {
    const draft = ensureDraft(drafts, event.messageId);
    drafts.set(event.messageId, { ...draft, parts: [...draft.parts, event.part] });
  }
  return { ...state, drafts, error: undefined };
}

