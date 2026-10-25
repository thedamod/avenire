import { FeatureSheetHeader as SheetHeader } from "./FeatureUi";
import { useEffect, useState, type PropsWithChildren } from "react";
import { Modal, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";
import { Pressable } from "../../ui";

/** Feature-local fallback until the UI kit owns a menu/dialog primitive. */
export function FeatureOverlay({
  visible,
  title,
  onClose,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
}>) {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 160);
    return () => clearTimeout(timer);
  }, [visible]);
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {visible ? (
          <Animated.View
            entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
            exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
            style={{ position: "absolute", inset: 0, backgroundColor: "#0000008C" }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
              onPress={onClose}
              style={{ flex: 1 }}
            />
          </Animated.View>
        ) : null}
        {visible ? (
          <Animated.View
            entering={FadeInDown.duration(200)
              .easing(Easing.bezier(0.23, 1, 0.32, 1))
              .reduceMotion(ReduceMotion.System)}
            exiting={FadeOutDown.duration(150).reduceMotion(ReduceMotion.System)}
            style={{
              maxHeight: "90%",
              paddingTop: 12,
              paddingBottom: 34,
              backgroundColor: "#131313",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: "#2A2A2A",
            }}
          >
            <SheetHeader title={title} onClose={onClose} />
            {children}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
