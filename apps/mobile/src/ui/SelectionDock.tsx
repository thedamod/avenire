import { GlassBackdrop } from "./GlassBackdrop";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";
import { IconButton, type IconButtonProps } from "./IconButton";
import { Text } from "./Text";
export interface SelectionDockProps {
  count: number;
  actions: readonly IconButtonProps[];
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}
export function SelectionDock({ count, actions, floating = true, style }: SelectionDockProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        floating
          ? {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingTop: 24,
              paddingBottom: Math.max(insets.bottom, 30),
            }
          : undefined,
        { alignItems: "center", paddingHorizontal: 16 },
        style,
      ]}
    >
      {floating ? (
        <LinearGradient
          pointerEvents="none"
          colors={["#0B0B0B00", colors.bg]}
          locations={[0, 0.4]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={{
          height: 52,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: "#FFFFFF14",
          backgroundColor: "#181818E6",
          overflow: "hidden",
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 18,
          paddingRight: 8,
          gap: 4,
        }}
      >
        <GlassBackdrop />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 14,
            lineHeight: 18,
            fontWeight: "600",
            color: colors.fg,
            paddingRight: 8,
          }}
        >
          {count} selected
        </Text>
        <View style={{ height: 20, width: 1, backgroundColor: colors["line-2"] }} />
        {actions.map((action) => (
          <IconButton
            key={action.accessibilityLabel}
            {...action}
            color={action.color ?? colors.fg}
          />
        ))}
      </View>
    </View>
  );
}
