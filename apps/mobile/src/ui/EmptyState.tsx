import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { Icon, type IconName } from "./Icon";
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 28, paddingVertical: 40, alignItems: "center", gap: 10 }}>
      {icon ? <Icon name={icon} size={24} /> : null}
      <Text variant="section" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {description ? <Text style={{ textAlign: "center" }}>{description}</Text> : null}
      {action}
    </View>
  );
}
