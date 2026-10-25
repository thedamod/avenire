import { useEffect, type ReactNode } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import { colors } from "../theme/tokens";
import { iconPaths, type IconName } from "./iconPaths";
export { iconPaths, type IconName } from "./iconPaths";
export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}
export function Icon({ name, size = 16, color = colors["fg-2"], strokeWidth = 1.5 }: IconProps) {
  const glyph = (
    <SvgXml
      pointerEvents="none"
      width={size}
      height={size}
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" color="${color}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`}
    />
  );
  return name === "spinner" ? <SpinningGlyph size={size}>{glyph}</SpinningGlyph> : glyph;
}

function SpinningGlyph({ size, children }: { size: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(
      reduced
        ? 0
        : withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return <Animated.View style={[{ width: size, height: size }, style]}>{children}</Animated.View>;
}
