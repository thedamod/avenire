/**
 * What Ruth is waiting on, rebuilt from the last assistant message's parts (so it survives a
 * reload): file-action approvals and `ask_user` questions.
 */
import type { RuthUIMessage } from "@avenire/ai/message-types";

import { asToolPart, field, toolName } from "./toolParts.ts";

export interface PendingApproval {
  readonly approvalId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly input: unknown;
}

export interface PendingQuestion {
  readonly toolCallId: string;
  readonly question: string;
  readonly choices: readonly string[];
  readonly multiSelect: boolean;
  readonly allowCustom: boolean;
}

export interface PendingRequests {
  /** Approvals grouped by tool, so "Move 3 files to Trash" is one card. */
  readonly approvalGroups: readonly (readonly PendingApproval[])[];
  readonly questions: readonly PendingQuestion[];
}

const NONE: PendingRequests = { approvalGroups: [], questions: [] };

export function pendingRequests(messages: readonly RuthUIMessage[]): PendingRequests {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return NONE;
  const groups = new Map<string, PendingApproval[]>();
  const questions: PendingQuestion[] = [];
  for (const part of last.parts) {
    const tool = asToolPart(part);
    if (!tool) continue;
    const name = toolName(tool);
    if (tool.state === "approval-requested" && tool.approval) {
      const list = groups.get(name) ?? [];
      list.push({
        approvalId: tool.approval.id,
        toolCallId: tool.toolCallId,
        tool: name,
        input: tool.input,
      });
      groups.set(name, list);
    } else if (name === "ask_user" && tool.state === "input-available") {
      const choices = field(tool.input, "choices");
      questions.push({
        toolCallId: tool.toolCallId,
        question: String(field(tool.input, "question") ?? "Ruth has a question"),
        choices: Array.isArray(choices) ? choices.map(String) : [],
        multiSelect: field(tool.input, "multiSelect") === true,
        allowCustom: field(tool.input, "allowCustom") !== false,
      });
    }
  }
  if (!groups.size && !questions.length) return NONE;
  return { approvalGroups: [...groups.values()], questions };
}

/** Choice strings like "Midterm · Oct 28 — Lectures 1–8" split into a label and a detail. */
export function splitChoice(choice: string): { label: string; detail: string | null } {
  const match = /^(.*?)\s+[—–-]\s+(.+)$/.exec(choice);
  return match ? { label: match[1]!, detail: match[2]! } : { label: choice, detail: null };
}
