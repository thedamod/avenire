import { View } from "react-native";
import { colors } from "../theme/tokens";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
export interface Segment<T extends string> {
  value: T;
  label: string;
}
export interface SegmentedControlProps<T extends string> {
  items: readonly Segment<T>[];
  value: T;
  onValueChange: (value: T) => void;
  accessibilityLabel?: string;
}
export function SegmentedControl<T extends string>({
  items,
  value,
  onValueChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        padding: 2,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors["surface-2"],
        borderRadius: 9,
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
            flex: 1,
            height: 34,
            borderRadius: 7,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: item.value === value ? colors["surface-4"] : "transparent",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12.5,
              lineHeight: 16,
              color: item.value === value ? colors.fg : colors["fg-2"],
              fontWeight: item.value === value ? "600" : "400",
            }}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
