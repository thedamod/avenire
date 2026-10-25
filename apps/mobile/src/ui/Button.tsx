import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "destructive";
export interface ButtonProps extends Omit<PressableProps, "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  busy?: boolean;
  icon?: IconName;
}
export function Button({
  children,
  variant = "primary",
  busy = false,
  disabled,
  icon,
  style,
  haptic = "tap",
  ...props
}: ButtonProps) {
  const foreground =
    variant === "primary"
      ? "#0A0A0A"
      : variant === "destructive"
        ? colors.red
        : variant === "ghost" || variant === "link"
          ? colors["fg-2"]
          : colors.fg;
  return (
    <Pressable
      {...props}
      haptic={haptic}
      accessibilityRole="button"
      disabled={disabled || busy}
      style={(state) => [
        styles.base,
        styles[variant],
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <Icon name={icon} size={14} color={foreground} />
      ) : null}
      {typeof children === "string" ? (
        <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: "500", color: foreground }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  primary: { backgroundColor: colors.fg },
  secondary: {
    backgroundColor: colors["surface-3"],
    borderWidth: 1,
    borderColor: colors["line-2"],
  },
  ghost: { paddingHorizontal: 4 },
  link: { paddingHorizontal: 0 },
  destructive: { backgroundColor: "#2A1416", borderWidth: 1, borderColor: "#4A2226" },
});
export interface ActionBtnProps extends Omit<ButtonProps, "variant"> {
  active?: boolean;
}
export function ActionBtn({ active = false, icon, children, style, ...props }: ActionBtnProps) {
  return (
    <Button
      {...props}
      variant="ghost"
      style={(state) => [
        {
          paddingHorizontal: 11,
          borderWidth: 1,
          borderColor: active ? colors["accent-line"] : colors["line-2"],
          backgroundColor: active ? colors["accent-tint"] : "transparent",
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          size={14}
          strokeWidth={1.4}
          color={active ? colors["accent-text"] : colors["fg-2"]}
        />
      ) : null}
      {typeof children === "string" ? (
        <Text variant="label" color={active ? "accent-text" : "fg"} style={{ lineHeight: 16 }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Button>
  );
}
