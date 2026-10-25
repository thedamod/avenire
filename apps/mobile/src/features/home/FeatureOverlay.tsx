import { useEffect, useState, type PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Pressable } from "../../ui";

/** Local overlay until the shared kit exposes a controlled menu / picker surface. */
export function FeatureOverlay({
  open,
  onClose,
  label,
  children,
  menu = false,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  label: string;
  menu?: boolean;
}>) {
  const [visible, setVisible] = useState(open);
  const progress = useSharedValue(0);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (open) setVisible(true);
    progress.value = withTiming(
      open ? 1 : 0,
      {
        duration: open ? 200 : 150,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        reduceMotion: ReduceMotion.System,
      },
      (finished) => {
        if (finished && !open) runOnJS(setVisible)(false);
      },
    );
  }, [open, progress]);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const surface = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#00000080" },
            backdrop,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${label}`}
            onPress={onClose}
            pressScale={1}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={[
            {
              position: "absolute",
              backgroundColor: "#131313",
              borderColor: "#2A2A2A",
              borderWidth: 1,
              overflow: "hidden",
            },
            menu
              ? {
                  right: 16,
                  top: insets.top + 48,
                  width: 256,
                  borderRadius: 10,
                }
              : {
                  left: 0,
                  right: 0,
                  bottom: 0,
                  maxHeight: "85%",
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingBottom: Math.max(insets.bottom, 30) + 8,
                },
            surface,
          ]}
        >
          {!menu ? (
            <View style={{ alignItems: "center", paddingVertical: 7 }}>
              <View
                style={{
                  width: 36,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: "#3A3A3A",
                }}
              />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
