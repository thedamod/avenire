import type { PropsWithChildren } from "react";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme/tokens";
export interface ScreenProps extends PropsWithChildren {
  edges?: readonly Edge[];
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}
/** Headers own their horizontal padding. Screen deliberately adds none. */
export function Screen({
  children,
  edges = ["top", "left", "right", "bottom"],
  scroll = false,
  style,
  contentStyle,
}: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ flexGrow: 1 }, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
