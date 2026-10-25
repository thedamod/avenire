import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { colors } from "../../../theme/tokens";
import { Icon, IconButton, Pressable, Text, type IconName } from "../../../ui";

export interface SheetTab {
  key: string;
  label: string;
  icon: IconName;
}
/** Paper's 32pt output tabs in a 44pt scrolling lane, with full-size touch targets. */
export function OutputTabs({
  tabs,
  selected,
  onSelect,
  onClose,
}: {
  tabs: readonly SheetTab[];
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    scroll.current?.scrollTo({
      x: Math.max(0, (positions.current.get(selected) ?? 0) - 16),
      animated: false,
    });
  }, [selected]);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 44,
        paddingLeft: 16,
        paddingRight: 8,
        gap: 4,
      }}
    >
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center", gap: 4 }}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: selected === tab.key }}
            onPress={() => onSelect(tab.key)}
            onLayout={(event) => positions.current.set(tab.key, event.nativeEvent.layout.x)}
            style={{ height: 44, justifyContent: "center" }}
          >
            <View
              style={{
                height: 32,
                paddingHorizontal: 11,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: selected === tab.key ? colors["surface-4"] : "transparent",
              }}
            >
              <Icon
                name={tab.icon}
                size={14}
                color={selected === tab.key ? colors.fg : colors["fg-3"]}
              />
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 18,
                  color: selected === tab.key ? colors.fg : colors["fg-2"],
                  fontWeight: selected === tab.key ? "600" : "400",
                }}
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <IconButton icon="close" accessibilityLabel="Close outputs" onPress={onClose} />
    </View>
  );
}
