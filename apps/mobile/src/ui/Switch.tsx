import { useEffect } from "react";
import Animated, {
  Easing,
  ReduceMotion,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, motion } from "../theme/tokens";
import { Pressable } from "./Pressable";
export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}
export function Switch({ value, onValueChange, accessibilityLabel, disabled }: SwitchProps) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: 150,
      easing: Easing.bezier(...motion.easing.out),
      reduceMotion: ReduceMotion.System,
    });
  }, [value, progress]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ["#39393D", colors.green]),
  }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * 20 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      disabled={disabled}
      haptic={value ? "toggle-off" : "toggle-on"}
      onPress={() => onValueChange(!value)}
      style={{ width: 51, height: 31 }}
      hitSlop={6}
    >
      <Animated.View style={[{ width: 51, height: 31, borderRadius: 16, padding: 2 }, track]}>
        <Animated.View
          style={[{ width: 27, height: 27, borderRadius: 14, backgroundColor: "#FFFFFF" }, thumb]}
        />
      </Animated.View>
    </Pressable>
  );
}
