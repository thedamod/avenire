import type { PropsWithChildren } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme/tokens";
export function Aside({
  children,
  color = colors["line-2"],
  gap = 6,
  style,
}: PropsWithChildren<{ color?: string; gap?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <View
      style={[
        { borderLeftWidth: 2, borderLeftColor: color, paddingLeft: 12, paddingVertical: 2, gap },
        style,
      ]}
    >
      {children}
    </View>
  );
}
