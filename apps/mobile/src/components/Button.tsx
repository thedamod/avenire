import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

export function Button({
  children,
  onPress,
  disabled = false,
  variant = "primary",
  busy = false,
}: PropsWithChildren<{
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly variant?: "primary" | "secondary" | "destructive";
}>) {
  const primary = variant === "primary";
  const destructive = variant === "destructive";
  const containerClass = primary
    ? "bg-primary"
    : destructive
      ? "border border-destructive/30 bg-card"
      : "border border-border bg-card";
  const textClass = primary
    ? "text-primary-foreground"
    : destructive
      ? "text-destructive"
      : "text-foreground";

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      className={`min-h-12 items-center justify-center rounded-xl px-4 py-3 ${containerClass} ${disabled ? "opacity-50" : ""}`}
    >
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Text className={`font-semibold ${textClass}`}>{children}</Text>
      )}
    </Pressable>
  );
}
