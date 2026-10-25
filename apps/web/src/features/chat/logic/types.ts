import type { RuthUIMessage } from "@avenire/ai/message-types";

export type RuthPart = RuthUIMessage["parts"][number];
export type RuthToolPart = Extract<RuthPart, { type: `tool-${string}` }>;

export type WorkIcon =
  | "search"
  | "read"
  | "list"
  | "write"
  | "move"
  | "rename"
  | "trash"
  | "code"
  | "widget"
  | "image"
  | "video"
  | "computer"
  | "skill"
  | "page"
  | "question"
  | "tool";

export type WorkStatus = "running" | "done" | "error" | "waiting";

export interface WorkCall {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly detail: string | null;
  readonly status: WorkStatus;
}

export interface WorkEntry {
  readonly id: string;
  readonly icon: WorkIcon;
  readonly label: string;
  /** Extra lines shown when the entry is expanded (queries, files read, and user-facing results). */
  readonly detail: string | null;
  readonly status: WorkStatus;
  readonly calls: readonly WorkCall[];
}

export type MediaItem =
  | {
      readonly kind: "widget";
      readonly id: string;
      readonly url: string;
      readonly title: string;
      readonly figure: number;
    }
  | {
      readonly kind: "image" | "video";
      readonly id: string;
      readonly url: string;
      readonly title: string;
      readonly figure: number;
      readonly durationSec: number | null;
    }
  | {
      readonly kind: "file";
      readonly id: string;
      readonly url: string;
      readonly title: string;
      readonly mediaType: string;
      readonly sizeBytes: number | null;
    }
  | { readonly kind: "pending"; readonly id: string; readonly title: string };

export interface AttachmentChip {
  readonly name: string;
  readonly mediaType: string;
  readonly url: string;
}

export type RequestState = "waiting" | "approved" | "declined" | "answered";

export type ChatRow =
  | {
      readonly kind: "user";
      readonly id: string;
      readonly messageId: string;
      readonly text: string;
      readonly attachments: readonly AttachmentChip[];
      readonly sig: string;
    }
  | {
      readonly kind: "work-header";
      readonly id: string;
      readonly messageId: string;
      readonly active: boolean;
      readonly startedAt: number | null;
      readonly finishedAt: number | null;
      readonly steps: number;
      readonly expanded: boolean;
    }
  | {
      readonly kind: "work";
      readonly id: string;
      readonly messageId: string;
      readonly entries: readonly WorkEntry[];
      readonly sig: string;
    }
  | {
      readonly kind: "prose";
      readonly id: string;
      readonly messageId: string;
      readonly text: string;
      readonly streaming: boolean;
    }
  | {
      readonly kind: "reasoning";
      readonly id: string;
      readonly messageId: string;
      readonly text: string;
      readonly streaming: boolean;
    }
  | {
      readonly kind: "media";
      readonly id: string;
      readonly messageId: string;
      readonly items: readonly MediaItem[];
      readonly sig: string;
    }
  | {
      readonly kind: "request";
      readonly id: string;
      readonly messageId: string;
      readonly label: string;
      readonly state: RequestState;
    }
  | {
      readonly kind: "error";
      readonly id: string;
      readonly messageId: string;
      readonly text: string;
    }
  | {
      readonly kind: "subagent";
      readonly id: string;
      readonly messageId: string;
      readonly label: string;
      readonly progress: number | null;
    }
  | {
      readonly kind: "cloud-run";
      readonly id: string;
      readonly messageId: string;
      readonly runId: string;
    }
  | {
      readonly kind: "thinking";
      readonly id: string;
      readonly startedAt: number | null;
      readonly lastTool: string | null;
    };

export type ChatRowKind = ChatRow["kind"];

export interface TurnTiming {
  readonly startedAt: number;
  readonly finishedAt?: number;
}

export type ChatRunStatus = "submitted" | "streaming" | "ready" | "error";

export interface DeriveRowsInput {
  readonly messages: readonly RuthUIMessage[];
  readonly status: ChatRunStatus;
  /** Explicit expand/collapse choices for a message's "Worked for" group. */
  readonly workExpanded: ReadonlyMap<string, boolean>;
  readonly timings: ReadonlyMap<string, TurnTiming>;
  /** When the current turn was sent; drives the thinking row before the reply appears. */
  readonly turnStartedAt: number | null;
  readonly error: string | null;
}
