import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { Text } from "../../../ui";

export function FigureFrame({ title, figure, compact = false, children }: PropsWithChildren<{ title: string; figure: number; compact?: boolean }>) {
  return <View accessibilityLabel={`Figure ${figure}: ${title}`} style={{ gap: 6, minWidth: 0, flex: compact ? 1 : undefined }}>
    <View style={{ borderWidth: 1, borderColor: compact ? "#2E2E2E" : "#3A3A3A", backgroundColor: "#0E0E0E", borderRadius: compact ? 8 : 0, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
        <Text variant="mono" color="fg-2" style={{ fontSize: 9.5 }}>Fig {figure}</Text>
        <Text variant="mono" color="fg-2" numberOfLines={1} style={{ fontSize: 9.5, letterSpacing: 0.76, flexShrink: 1 }}>{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  </View>;
}
