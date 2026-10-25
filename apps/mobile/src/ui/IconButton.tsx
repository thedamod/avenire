import { Icon, type IconName } from "./Icon";
import { Pressable, type PressableProps } from "./Pressable";
import { colors } from "../theme/tokens";
export interface IconButtonProps extends Omit<PressableProps, "children"> {
  icon: IconName;
  accessibilityLabel: string;
  size?: number;
  iconSize?: number;
  strokeWidth?: number;
  color?: string;
  active?: boolean;
}
export function IconButton({
  icon,
  size = 44,
  iconSize = 18,
  strokeWidth = 1.5,
  color = colors["fg-2"],
  active,
  style,
  haptic = "tap",
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      {...props}
      haptic={haptic}
      accessibilityRole="button"
      style={(state) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? colors["surface-4"] : "transparent",
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={color} strokeWidth={strokeWidth} />
    </Pressable>
  );
}
