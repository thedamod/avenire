import type { RuthUIMessage } from "@avenire/ai/message-types";
import type { Asset, CloudRun, LibraryFile, PendingApproval } from "@avenire/contracts";
import type { RootStackParamList } from "../../../navigation";
import { asToolPart, text, toolName } from "./toolParts";
import type { IconName } from "../../../ui";

export interface OutputItem {
  id: string;
  title: string;
  output: RootStackParamList["Output"]["output"];
  icon: IconName;
}

export interface FileChange {
  id: string;
  title: string;
  detail: string | null;
  status: PendingApproval["status"];
  verb: "Create note" | "Move" | "Rename" | "Update";
  icon: IconName;
  /** Live chat tool approvals and durable Cloud sync approvals have separate transports. */
  transport: "chat" | "cloud";
}

export function reportOutputs(messages: readonly RuthUIMessage[], files: readonly LibraryFile[], assets: readonly Asset[]): OutputItem[] {
  const outputs = new Map<string, OutputItem>();
  const byId = new Map(files.map((file) => [file.id as string, file]));
  for (const message of messages) for (const part of message.parts) {
    const tool = asToolPart(part);
    if (!tool || tool.state !== "output-available" || toolName(tool) !== "publish_output" || text(tool.output, "kind") !== "file") continue;
    const id = text(tool.output, "fileId");
    if (!id) continue;
    const file = byId.get(id);
    if (file?.placement === "archived") continue;
    const title = file?.title ?? text(tool.input, "title") ?? "Summary";
    const quiz = /quiz|questions|test yourself/i.test(title);
    const revision = /revision/i.test(title);
    // Other output formats have no route representation in this round.
    if (!quiz && !revision && file && file.kind !== "note") continue;
    outputs.set(id, { id, title: quiz ? "Quiz" : revision ? "Revision" : "Summary", output: quiz ? "quiz" : revision ? "revision" : "summary", icon: quiz ? "quiz" : revision ? "lines" : "doc" });
  }
  for (const asset of assets) if (asset.kind === "widget") outputs.set(asset.id, { id: asset.id, title: asset.title, output: "widget", icon: "widget" });
  return [...outputs.values()];
}

export function cloudChanges(approvals: readonly PendingApproval[]): FileChange[] {
  return approvals.map((item) => ({ id: item.id, title: item.fileTitle, detail: item.conflict ?? item.summary, status: item.status, verb: "Update", icon: item.status === "conflict" ? "alert" : "pencil", transport: "cloud" }));
}

export function liveChanges(messages: readonly RuthUIMessage[], files: readonly LibraryFile[]): FileChange[] {
  const byId = new Map(files.map((file) => [file.id as string, file]));
  const changes = new Map<string, FileChange>();
  for (const message of messages) for (const part of message.parts) {
    const tool = asToolPart(part);
    if (!tool?.approval) continue;
    const name = toolName(tool);
    if (!["write_file", "move_file", "rename_file"].includes(name)) continue;
    const fileId = text(tool.input, "fileId");
    const file = fileId ? byId.get(fileId) : undefined;
    const title = file?.title ?? text(tool.input, "title") ?? "A file";
    changes.set(tool.approval.id, {
      id: tool.approval.id, title,
      detail: name === "rename_file" ? `→ ${text(tool.input, "title") ?? "New title"}` : text(tool.output, "summary") ?? null,
      status: tool.approval.approved === true ? "accepted" : tool.approval.approved === false ? "skipped" : "pending",
      verb: name === "write_file" ? "Create note" : name === "move_file" ? "Move" : "Rename",
      icon: name === "write_file" ? "plus" : name === "move_file" ? "move" : "pencil", transport: "chat",
    });
  }
  return [...changes.values()];
}

export function elapsedLabel(startedAt: number | null, finishedAt: number | null, active: boolean, overnight = false) {
  const duration = startedAt === null ? null : Math.max(0, Math.floor(((finishedAt ?? (active ? Date.now() : startedAt)) - startedAt) / 1000));
  const time = duration === null ? "" : duration >= 60 ? `${Math.floor(duration / 60)}m ${String(duration % 60).padStart(2, "0")}s` : `${duration}s`;
  return `${active ? "Working" : "Worked"}${overnight ? " overnight" : ""}${time ? ` for ${time}` : ""}`;
}

export function runDate(run: CloudRun): string {
  return new Date(run.scheduledFor).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
