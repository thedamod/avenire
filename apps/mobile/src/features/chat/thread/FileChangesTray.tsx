import { useState } from "react";
import { View } from "react-native";
import { colors } from "../../../theme/tokens";
import { Icon, Text } from "../../../ui";
import type { FileChange } from "./report";
import { ThreadTray, TrayButton, TrayRow } from "./ThreadTray";

export function FileChangesTray({ changes, busy, onDecide, onDecideAll }: {
  changes: readonly FileChange[]; busy: boolean;
  onDecide: (change: FileChange, decision: "accept" | "skip") => void;
  onDecideAll: (decision: "accept" | "skip") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const accepted = changes.filter((row) => row.status === "accepted").length;
  const waiting = changes.filter((row) => row.status === "pending" || row.status === "conflict").length;
  const skipped = changes.filter((row) => row.status === "skipped").length;
  const meta = [accepted ? `${accepted} accepted` : "", skipped ? `${skipped} skipped` : "", waiting ? `${waiting} waiting` : ""].filter(Boolean).join(" · ");
  const canAccept = changes.some((row) => row.status === "pending");
  return <ThreadTray title={`${changes.length} file ${changes.length === 1 ? "change" : "changes"}`} meta={meta} expanded={expanded} onToggle={() => setExpanded(!expanded)}
    inline={!expanded && waiting ? <TrayButton disabled={busy || !canAccept} onPress={() => onDecideAll("accept")}>Accept all</TrayButton> : undefined}
    footer={<><View style={{ flex: 1 }} /><TrayButton variant="ghost" disabled={busy || !waiting} onPress={() => onDecideAll("skip")}>Skip all</TrayButton><TrayButton disabled={busy || !canAccept} onPress={() => onDecideAll("accept")}>Accept all</TrayButton></>}>
    {changes.map((change) => <TrayRow key={change.id} title={`${change.verb} · ${change.title}`} detail={change.detail} leading={<Icon name={change.icon} size={14} color={change.verb === "Create note" ? colors.green : change.verb === "Rename" ? colors.amber : colors.accent} />}
      trailing={change.status === "pending" || change.status === "conflict" ? <View style={{ flexDirection: "row", gap: 4 }}><TrayButton variant="ghost" accessibilityLabel={`Skip ${change.title}`} disabled={busy} onPress={() => onDecide(change, "skip")}>Skip</TrayButton>{change.status !== "conflict" ? <TrayButton variant="secondary" accessibilityLabel={`Accept ${change.title}`} disabled={busy} onPress={() => onDecide(change, "accept")}>Accept</TrayButton> : null}</View> : <Text variant="meta">{change.status === "accepted" ? "Accepted" : "Skipped"}</Text>} />)}
  </ThreadTray>;
}
