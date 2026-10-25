import type { ReactNode } from "react";
import { View } from "react-native";
import { GlassButton, type GlassButtonProps } from "./GlassButton";
import { Text } from "./Text";
export interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  large?: boolean;
  onBack?: (() => void) | undefined;
  backIcon?: "back" | "close";
  trailing?: readonly GlassButtonProps[];
  leading?: ReactNode;
}
export function GlassHeader({
  title,
  subtitle,
  large = false,
  onBack,
  backIcon = "back",
  trailing = [],
  leading,
}: GlassHeaderProps) {
  const actions = trailing.slice(0, 2);
  const slot = Math.max(
    40,
    actions.reduce((width, action) => width + (action.label ? 104 : (action.size ?? 40)), 0) +
      Math.max(0, actions.length - 1) * 8,
  );
  if (large)
    return (
      <View
        style={{
          height: 48,
          paddingLeft: 20,
          paddingRight: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text variant="homeTitle">{title}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {actions.map((props, index) => (
            <GlassButton key={index} {...props} />
          ))}
        </View>
      </View>
    );
  return (
    <View
      style={{
        height: 52,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <View style={{ width: slot, flexDirection: "row", alignItems: "center" }}>
        {leading ??
          (onBack ? (
            <GlassButton
              icon={backIcon}
              accessibilityLabel={backIcon === "close" ? "Close" : "Back"}
              onPress={onBack}
            />
          ) : null)}
      </View>
      <View style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 16,
            lineHeight: 20,
            fontWeight: "600",
            textAlign: "center",
            color: "#EDEDED",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" numberOfLines={1} style={{ lineHeight: 15, textAlign: "center" }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ width: slot, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        {actions.map((props, index) => (
          <GlassButton key={index} {...props} />
        ))}
      </View>
    </View>
  );
}
