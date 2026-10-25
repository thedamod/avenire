import { useEffect } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { WORDMARK_LENGTH, WORDMARK_PATH } from "./wordmark";
import { useMotionPreference } from "./useMotionPreference";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One continuous white stroke; no font approximation or separate dot path. */
export function Wordmark({ animate = false, width = 290 }: { animate?: boolean; width?: number }) {
  const reducedMotion = useMotionPreference();
  const offset = useSharedValue(animate && !reducedMotion ? WORDMARK_LENGTH : 0);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  useEffect(() => {
    offset.value = animate && !reducedMotion ? WORDMARK_LENGTH : 0;
    if (animate && !reducedMotion) {
      offset.value = withTiming(0, {
        duration: 1600,
        easing: Easing.bezier(0.77, 0, 0.175, 1),
        reduceMotion: ReduceMotion.System,
      });
    }
    return () => cancelAnimation(offset);
  }, [animate, reducedMotion, offset]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Avenire"
      style={{ maxWidth: "100%" }}
    >
      <Svg
        width={width}
        height={Math.round((width * 112) / 404)}
        viewBox="16 56 404 112"
        fill="none"
        accessible={false}
        style={{ maxWidth: "100%" }}
      >
        <AnimatedPath
          d={WORDMARK_PATH}
          stroke="#FFFFFF"
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[WORDMARK_LENGTH, WORDMARK_LENGTH]}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
