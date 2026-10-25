import { useEffect, useState } from "react";
import { View } from "react-native";
import { colors } from "../../../theme/tokens";
import { Icon, Pressable, Text } from "../../../ui";
import { elapsedLabel } from "./report";

export function WorkHeader({ startedAt, finishedAt, active, overnight = false, expanded, onToggle, time }: { startedAt: number | null; finishedAt: number | null; active: boolean; overnight?: boolean; expanded: boolean; onToggle: () => void; time?: string | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active || startedAt === null) return;
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [active, startedAt]);
  const label = elapsedLabel(startedAt, finishedAt, active, overnight);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} work log. ${label}`} accessibilityState={{ expanded }} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", minHeight: 34, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 6 }} hitSlop={5}>
    <Text color="fg-2" style={{ fontSize: 14, lineHeight: 18 }}>{label}</Text><Icon name={expanded ? "chevD" : "chevR"} size={12} color={colors["fg-3"]} /><View style={{ flex: 1 }} />{time ? <Text variant="meta">{time}</Text> : null}
  </Pressable>;
}
