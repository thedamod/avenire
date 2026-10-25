import type { ReactNode } from "react";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { View } from "react-native";
import { colors } from "../theme/tokens";
import { GlassButton } from "./GlassButton";
import { Text } from "./Text";
/** Sheets dismiss by dragging the grabber/header down (iOS) or with system back (Android). */
export function formSheetOptions(
  detent: "half" | "full" = "full",
  { scrollExpands = true }: { scrollExpands?: boolean } = {},
): NativeStackNavigationOptions {
  return {
    gestureEnabled: true,
    // Off for sheets whose body owns its own scroll/zoom (PDF, images): scrolling the
    // document must not resize the sheet out from under the reader.
    sheetExpandsWhenScrolledToEdge: scrollExpands,
    headerShown: false,
    presentation: "formSheet",
    sheetAllowedDetents: detent === "half" ? [0.55, 0.92] : [0.92],
    sheetInitialDetentIndex: 0,
    sheetGrabberVisible: true,
    sheetCornerRadius: 24,
    contentStyle: { backgroundColor: colors.sheet },
    animation: "slide_from_bottom",
    animationDuration: 250,
  };
}
export function SheetHeader({
  title,
  subtitle,
  onClose,
  trailing,
  grabber = false,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  trailing?: ReactNode;
  grabber?: boolean;
}) {
  return (
    <View style={{ backgroundColor: colors.sheet }}>
      {grabber ? (
        <View style={{ alignItems: "center", paddingVertical: 7 }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: "#3A3A3A" }} />
        </View>
      ) : null}
      <View
        style={{
          paddingTop: 6,
          paddingBottom: 10,
          paddingLeft: 20,
          paddingRight: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{title}</Text>
          {subtitle ? <Text variant="meta">{subtitle}</Text> : null}
        </View>
        {trailing}
        {onClose ? (
          <GlassButton icon="close" size={34} accessibilityLabel="Close sheet" onPress={onClose} />
        ) : null}
      </View>
    </View>
  );
}
