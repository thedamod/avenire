import type { PropsWithChildren } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewProps } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { colors } from "../theme/tokens";
export interface ScrollFadeProps extends ViewProps {
  top?: boolean;
  bottom?: boolean;
  size?: number;
  color?: string;
}
/** Wrap the scroll view, not its content. Turn top off until its scroll offset is positive. */
export function ScrollFade({
  children,
  top = true,
  bottom = true,
  size = 24,
  color = colors.bg,
  style,
  ...props
}: PropsWithChildren<ScrollFadeProps>) {
  const transparent = `${color.slice(0, 7)}00`;
  return (
    <View {...props} style={[{ flex: 1, overflow: "hidden" }, style]}>
      {children}
      {top ? (
        <LinearGradient
          pointerEvents="none"
          colors={[color, transparent]}
          style={[styles.edge, { top: 0, height: size }]}
        />
      ) : null}
      {bottom ? (
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
          style={[styles.edge, { bottom: 0, height: size }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[transparent, color]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ edge: { position: "absolute", left: 0, right: 0 } });
