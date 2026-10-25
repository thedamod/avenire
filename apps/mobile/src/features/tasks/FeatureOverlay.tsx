import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, motion } from "../../theme/tokens";
import { GlassButton, Icon, Pressable, SheetHeader, Text, ScrollFade } from "../../ui";
import { ScrollView } from "react-native";

/** Local until the shared UI kit owns an accessible, animated option sheet. */
export function FeatureOverlay({
  visible,
  onClose,
  children,
  full = false,
}: PropsWithChildren<{ visible: boolean; onClose: () => void; full?: boolean }>) {
  const [present, setPresent] = useState(visible);
  const lastChildren = useRef(children);
  useEffect(() => {
    if (visible) lastChildren.current = children;
  }, [children, visible]);
  const progress = useSharedValue(0);
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (visible) setPresent(true);
    progress.value = withTiming(visible ? 1 : 0, {
      duration: reduced ? 0 : visible ? 200 : 150,
      easing: Easing.bezier(...motion.easing.drawer),
    });
    if (!visible) {
      const timer = setTimeout(() => setPresent(false), reduced ? 0 : 150);
      return () => clearTimeout(timer);
    }
  }, [visible, reduced, progress]);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduced ? 0 : (1 - progress.value) * 24 }],
  }));
  return (
    <Modal
      visible={present}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#00000088" }, backdrop]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss sheet"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[
            {
              maxHeight: "92%",
              height: full ? "92%" : undefined,
              backgroundColor: colors.sheet,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 20),
              overflow: "hidden",
            },
            panel,
          ]}
        >
          {visible ? children : lastChildren.current}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
}
export function FeatureSheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <SheetHeader
      title={title}
      trailing={
        <GlassButton
          icon="close"
          size={34}
          hitSlop={5}
          accessibilityLabel="Close sheet"
          onPress={onClose}
        />
      }
    />
  );
}
export function ChoiceSheet<T extends string>({
  title,
  visible,
  value,
  options,
  onChange,
  onClose,
}: {
  title: string;
  visible: boolean;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <FeatureOverlay visible={visible} onClose={onClose}>
      <FeatureSheetHeader title={title} onClose={onClose} />
      <ScrollFade color={colors.sheet} style={{ flex: 0, flexShrink: 1 }} top={false}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: option.value === value }}
              onPress={() => {
                onChange(option.value);
                onClose();
              }}
              style={{
                minHeight: 48,
                paddingVertical: 12,
                paddingHorizontal: 20,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, lineHeight: 20, color: colors.fg }}>
                  {option.label}
                </Text>
                {option.description ? <Text variant="meta">{option.description}</Text> : null}
              </View>
              <View style={{ width: 16 }}>
                {option.value === value ? <Icon name="check" color={colors.fg} /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollFade>
    </FeatureOverlay>
  );
}
