import type { ReactNode } from "react";
import { colors } from "../theme/tokens";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";
export interface ChipProps extends Omit<PressableProps, "children"> {
  label: string;
  active?: boolean;
  count?: number;
  leading?: ReactNode;
  size?: 26 | 30 | 32;
}
export function Chip({
  label,
  active = false,
  count,
  leading,
  size = 26,
  style,
  haptic = "selection",
  ...props
}: ChipProps) {
  return (
    <Pressable
      {...props}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={(state) => [
        {
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors["line-2"],
          backgroundColor: active ? colors["surface-4"] : "transparent",
          paddingHorizontal: size === 26 ? 10 : 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {leading}
      <Text
        style={{
          fontSize: size === 26 ? 12 : 13,
          lineHeight: 16,
          color: active ? colors.fg : colors["fg-2"],
          fontWeight: active ? "500" : "400",
        }}
      >
        {label}
      </Text>
      {count !== undefined ? <Text variant="meta">{count}</Text> : null}
    </Pressable>
  );
}
