import {
  Platform,
  StyleSheet,
  Text as NativeText,
  type TextProps as NativeTextProps,
  type TextStyle,
} from "react-native";
import { colors, type ColorToken } from "../theme/tokens";

export const textVariants = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600", letterSpacing: -0.48 },
  homeTitle: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.44 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  section: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: "500" },
  body: { fontSize: 13.5, lineHeight: 20, color: colors["fg-2"] },
  chat: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  meta: { fontSize: 12, lineHeight: 16, color: colors["fg-3"] },
  mono: { fontFamily: "GeistMono", fontSize: 11, lineHeight: 15, color: colors["fg-2"] },
});
export type TextVariant = keyof typeof textVariants;
export interface TextProps extends NativeTextProps {
  variant?: TextVariant;
  color?: ColorToken | (string & {});
  weight?: TextStyle["fontWeight"];
}
export function Text({ variant = "body", color, weight, style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[
        { color: colors.fg, fontFamily: Platform.OS === "web" ? "system-ui" : undefined },
        textVariants[variant],
        color ? { color: color in colors ? colors[color as ColorToken] : color } : undefined,
        weight ? { fontWeight: weight } : undefined,
        style,
      ]}
    />
  );
}
