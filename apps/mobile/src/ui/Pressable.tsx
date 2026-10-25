import { useState } from "react";
import {
  Pressable as NativePressable,
  type PressableProps as NativePressableProps,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { haptic as feedback, type HapticKind } from "../lib/haptics";
import { motion } from "../theme/tokens";
const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);
export interface PressableProps extends NativePressableProps {
  pressScale?: number;
  disabledOpacity?: number;
  /** Feedback when a press commits. Silent by default; primitives choose their own kind. */
  haptic?: HapticKind | "none";
  /** Feedback when onLongPress fires. Defaults to "long-press". */
  longPressHaptic?: HapticKind | "none";
}
/** Interruptible feedback, honoring reduced motion. Animated styles remain directly attached.
 * Haptics fire on commit (onPress/onLongPress), never on press-in, so a touch that turns into
 * a scroll stays silent; disabled or handler-less pressables never buzz. */
export function Pressable({
  style,
  pressScale = motion.pressScale,
  disabledOpacity = 0.45,
  onPressIn,
  onPressOut,
  onPress,
  onLongPress,
  disabled,
  haptic = "none",
  longPressHaptic = "long-press",
  ...props
}: PressableProps) {
  // `disabled` and `accessibilityState.disabled` are one state: either makes the control inert
  // for touch, opacity, haptics and assistive tech alike.
  const inert = Boolean(disabled || props.accessibilityState?.disabled);
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const timing = {
    duration: motion.duration.fast,
    easing: Easing.bezier(...motion.easing.out),
    reduceMotion: ReduceMotion.System,
  };
  return (
    <AnimatedPressable
      {...props}
      disabled={inert}
      accessibilityState={{ ...props.accessibilityState, disabled: inert }}
      onPress={
        onPress
          ? (event) => {
              if (!inert) feedback(haptic);
              onPress(event);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (event) => {
              if (!inert) feedback(longPressHaptic);
              onLongPress(event);
            }
          : undefined
      }
      onPressIn={(event) => {
        setPressed(true);
        scale.value = withTiming(pressScale, timing);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        scale.value = withTiming(1, timing);
        onPressOut?.(event);
      }}
      style={[
        typeof style === "function" ? style({ pressed }) : style,
        inert ? { opacity: disabledOpacity } : undefined,
        animated,
      ]}
    />
  );
}
