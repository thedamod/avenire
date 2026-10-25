import type { LibraryFile, Folder } from "@avenire/contracts";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "../../../ui";
import type { PendingApproval } from "./requests";
import { text } from "./toolParts";
import { ThreadTray, TrayButton, TrayRow } from "./ThreadTray";

export function ApprovalTray({ groups, files, folders, busy, onDecide, onAlwaysAllow, onCancel }: {
  groups: readonly (readonly PendingApproval[])[]; files: readonly LibraryFile[]; folders: readonly Folder[];
  busy: boolean; onDecide: (group: readonly PendingApproval[], approved: boolean) => void;
  onAlwaysAllow: (group: readonly PendingApproval[]) => void; onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const group = groups[0];
  if (!group?.length) return null;
  const tool = group[0]!.tool;
  const count = group.length === 1 ? "a file" : `${group.length} files`;
  const title = tool === "archive_file" ? `Move ${count} to Trash` : tool === "move_file" ? `Move ${count}` : tool === "rename_file" ? `Rename ${count}` : tool === "write_file" ? `Create ${group.length === 1 ? "a note" : `${group.length} notes`}` : `Allow ${tool.replaceAll("_", " ")}`;
  return <ThreadTray title={title} meta={tool === "archive_file" ? "Needs your approval · kept for 30 days" : "Needs your approval"} step={`1/${groups.length}`} expanded={expanded} onToggle={() => setExpanded(!expanded)}
    inline={!expanded ? <TrayButton disabled={busy} onPress={() => onDecide(group, true)}>Approve</TrayButton> : undefined}
    footer={<><TrayButton variant="ghost" disabled={busy} onPress={onCancel}>Cancel</TrayButton><TrayButton variant="ghost" disabled={busy} onPress={() => onAlwaysAllow(group)}>Always allow</TrayButton><View style={{ flex: 1 }} /><TrayButton variant="secondary" disabled={busy} onPress={() => onDecide(group, false)}>Decline</TrayButton><TrayButton disabled={busy} onPress={() => onDecide(group, true)}>Approve</TrayButton></>}>
    {group.map((item) => {
      const file = files.find((file) => file.id === text(item.input, "fileId"));
      const folder = folders.find((folder) => folder.id === text(item.input, "folderId"));
      const name = file?.title ?? text(item.input, "title") ?? "A file";
      const detail = item.tool === "archive_file" ? "Move to Trash · kept for 30 days" : item.tool === "rename_file" ? `Rename to ${text(item.input, "title") ?? "New title"}` : item.tool === "move_file" ? `Move to ${folder?.name ?? "Unfiled"}` : `New note in ${folder?.name ?? "Unfiled"}`;
      return <TrayRow key={item.approvalId} title={name} detail={detail} leading={<Icon name={item.tool === "archive_file" ? "trash" : "doc"} size={14} />} />;
    })}
  </ThreadTray>;
}
