import { View } from "react-native";
import { colors } from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
export interface UnderlineTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}
export interface UnderlineTabsProps<T extends string> {
  items: readonly UnderlineTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
}
export function UnderlineTabs<T extends string>({
  items,
  value,
  onValueChange,
}: UnderlineTabsProps<T>) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 22,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.value === value }}
          haptic={item.value === value ? "none" : "selection"}
          onPress={() => onValueChange(item.value)}
          style={{
            flexDirection: "row",
            gap: 6,
            paddingBottom: item.value === value ? 10 : 11.5,
            borderBottomWidth: item.value === value ? 1.5 : 0,
            borderBottomColor: colors.fg,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              lineHeight: 20,
              color: item.value === value ? colors.fg : colors["fg-2"],
              fontWeight: item.value === value ? "600" : "400",
            }}
          >
            {item.label}
          </Text>
          {item.count !== undefined ? (
            <Text variant="meta" style={{ fontSize: 13, lineHeight: 20 }}>
              {item.count}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
