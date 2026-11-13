"use client";

import type { FileId, FolderId } from "@avenire/contracts";
import { ScrollFade } from "@avenire/ui/components/scroll-fade";
import { Button } from "@avenire/ui/components/button";
import {
  ComposerTray,
  ComposerTrayActions,
  ComposerTrayBody,
  ComposerTrayHeader,
  ComposerTrayRow,
} from "@avenire/ui/components/composer-tray";
import { AlertCircle, CircleHelp, FilePen, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { splitChoice, type PendingApproval, type PendingQuestion } from "../logic/requests.ts";
import { field, quote, text } from "../logic/toolParts.ts";
import type { LibraryIndex } from "../useLibraryIndex.ts";

function fileTitle(library: LibraryIndex, id: string | undefined): string {
  return (id && library.fileById.get(id as FileId)?.title) || "A file";
}

function folderName(library: LibraryIndex, id: string | undefined): string {
  return (id && library.folderById.get(id as FolderId)?.name) || "another notebook";
}

function groupTitle(group: readonly PendingApproval[]): string {
  const n = group.length;
  const files = n === 1 ? "a file" : `${n} files`;
  switch (group[0]!.tool) {
    case "archive_file":
      return `Move ${files} to Trash`;
    case "move_file":
      return `Move ${files}`;
    case "rename_file":
      return `Rename ${files}`;
    case "write_file":
      return n === 1
        ? `Create ${quote(text(group[0]!.input, "title")) || "a note"}`
        : `Create ${n} notes`;
    default:
      return `Allow ${group[0]!.tool.replaceAll("_", " ")}`;
  }
}

function approvalRow(library: LibraryIndex, approval: PendingApproval) {
  const input = approval.input;
  switch (approval.tool) {
    case "archive_file":
      return {
        label: fileTitle(library, text(input, "fileId")),
        detail: "Move to Trash · kept for 30 days",
      };
    case "move_file":
      return {
        label: fileTitle(library, text(input, "fileId")),
        detail: `Move to ${folderName(library, text(input, "folderId"))}`,
      };
    case "rename_file":
      return {
        label: fileTitle(library, text(input, "fileId")),
        detail: `Rename to ${quote(text(input, "title"))}`,
      };
    case "write_file": {
      const content = text(input, "content") ?? "";
      const folder = text(input, "folderId");
      return {
        label: text(input, "title") ?? "New note",
        detail: `${folder ? `New note in ${folderName(library, folder)}` : "New note in Unfiled"}${
          content ? ` · ${content.replace(/\s+/g, " ").slice(0, 80)}` : ""
        }`,
      };
    }
    default:
      return {
        label: approval.tool.replaceAll("_", " "),
        detail: JSON.stringify(field(input, "fileId") ?? ""),
      };
  }
}

/** File-change approvals, one card per tool group (19a / M22). */
export function ApprovalTray({
  groups,
  library,
  onDecide,
  onAlwaysAllow,
  onCancel,
}: {
  readonly groups: readonly (readonly PendingApproval[])[];
  readonly library: LibraryIndex;
  readonly onDecide: (approvals: readonly PendingApproval[], approved: boolean) => void;
  readonly onAlwaysAllow: (approvals: readonly PendingApproval[]) => void;
  readonly onCancel: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const group = groups[0];
  if (!group) return null;
  const Icon = group[0]!.tool === "archive_file" ? Trash2 : FilePen;
  return (
    <ComposerTray collapsed={collapsed}>
      <ComposerTrayHeader
        icon={<Icon />}
        title={groupTitle(group)}
        meta={
          group[0]!.tool === "archive_file"
            ? "Needs your approval · kept in Trash for 30 days"
            : "Needs your approval"
        }
        step={`1/${groups.length}`}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        action={
          <Button size="sm" onClick={() => onDecide(group, true)}>
            Approve
          </Button>
        }
      />
      <ComposerTrayBody>
        <ScrollFade className="max-h-48 overflow-y-auto">
          {group.map((approval) => {
            const row = approvalRow(library, approval);
            return (
              <ComposerTrayRow
                key={approval.approvalId}
                icon={<FileText />}
                label={row.label}
                detail={row.detail}
              />
            );
          })}
        </ScrollFade>
        <ComposerTrayActions
          start={
            <>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="ghost" onClick={() => onAlwaysAllow(group)}>
                Always allow
              </Button>
            </>
          }
        >
          <Button variant="secondary" onClick={() => onDecide(group, false)}>
            Decline
          </Button>
          <Button onClick={() => onDecide(group, true)}>Approve</Button>
        </ComposerTrayActions>
      </ComposerTrayBody>
    </ComposerTray>
  );
}

/** Ruth's question, one at a time with choices (19b / M23). Free text goes in the composer. */
export function QuestionTray({
  questions,
  onAnswer,
  onSkip,
}: {
  readonly questions: readonly PendingQuestion[];
  readonly onAnswer: (question: PendingQuestion, answers: readonly string[]) => void;
  readonly onSkip: (question: PendingQuestion) => void;
}) {
  const question = questions[0];
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const id = question?.toolCallId;
  useEffect(() => setSelected([]), [id]);

  const toggle = (choice: string) => {
    if (!question) return;
    if (question.multiSelect)
      setSelected((current) =>
        current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice],
      );
    else setSelected([choice]);
  };

  // Number keys pick a choice unless the user is typing an answer.
  useEffect(() => {
    if (!question?.choices.length || collapsed) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target instanceof HTMLTextAreaElement && target.value) return;
      if (target instanceof HTMLInputElement) return;
      const index = Number(event.key) - 1;
      const choice = question.choices[index];
      if (!Number.isInteger(index) || choice === undefined) return;
      event.preventDefault();
      if (question.multiSelect) toggle(choice);
      else onAnswer(question, [choice]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!question) return null;
  return (
    <ComposerTray collapsed={collapsed}>
      <ComposerTrayHeader
        icon={<CircleHelp />}
        title={question.question}
        meta={
          question.multiSelect
            ? "Choose any that apply"
            : question.choices.length
              ? "Ava needs one answer to continue"
              : "Type your answer below"
        }
        {...(questions.length > 1 ? { step: `1/${questions.length}` } : {})}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
      />
      <ComposerTrayBody>
        {question.choices.length ? (
          <ScrollFade className="max-h-56 overflow-y-auto">
            {question.choices.map((choice, index) => {
              const { label, detail } = splitChoice(choice);
              const isSelected = selected.includes(choice);
              return (
                <ComposerTrayRow
                  key={choice}
                  label={label}
                  {...(detail ? { detail } : {})}
                  selected={isSelected}
                  onSelect={() => toggle(choice)}
                  onDoubleClick={() => onAnswer(question, [choice])}
                  trailing={
                    isSelected ? null : (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {index + 1}
                      </span>
                    )
                  }
                />
              );
            })}
          </ScrollFade>
        ) : null}
        <ComposerTrayActions
          start={
            <Button variant="ghost" onClick={() => onSkip(question)}>
              Skip
            </Button>
          }
        >
          {question.choices.length ? (
            <Button disabled={!selected.length} onClick={() => onAnswer(question, selected)}>
              {questions.length > 1 ? "Next" : "Send"}
            </Button>
          ) : null}
        </ComposerTrayActions>
      </ComposerTrayBody>
    </ComposerTray>
  );
}

/** A run that stopped with an error: never folded, with Retry. */
export function ErrorTray({
  message,
  onRetry,
  onDismiss,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onDismiss?: () => void;
}) {
  return (
    <ComposerTray tone="danger" className="flex-row items-center gap-2.5 py-2.5 pb-6">
      <AlertCircle className="size-[15px] shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 items-baseline gap-x-2 gap-y-0.5 max-md:flex-wrap">
        <span className="shrink-0 text-sm leading-5 font-semibold text-foreground">
          Ava stopped
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{message}</span>
      </div>
      {onDismiss ? (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      ) : null}
      <Button size="sm" onClick={onRetry} className="shrink-0">
        Retry
      </Button>
    </ComposerTray>
  );
}
