import { GlassBackdrop } from "./GlassBackdrop";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { Pressable, type PressableProps } from "./Pressable";
import { colors } from "../theme/tokens";
export interface GlassButtonProps extends Omit<PressableProps, "children"> {
  icon?: IconName;
  label?: string;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  accent?: boolean;
}
export function GlassButton({
  icon,
  label,
  size = 40,
  color = colors.fg,
  accent = false,
  style,
  haptic = "tap",
  ...props
}: GlassButtonProps) {
  return (
    <Pressable
      {...props}
      haptic={haptic}
      accessibilityRole="button"
      style={(state) => [
        {
          height: size,
          width: label ? undefined : size,
          paddingHorizontal: label ? 14 : 0,
          borderRadius: size / 2,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: accent ? colors["accent-line"] : "#FFFFFF14",
          backgroundColor: accent ? colors["accent-tint"] : "#1E1E1EB8",
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <GlassBackdrop />
      {icon ? <Icon name={icon} size={label ? 15 : 17} color={color} strokeWidth={1.6} /> : null}
      {label ? (
        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "500", color }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}
