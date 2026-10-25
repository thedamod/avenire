import { ScrollView, View } from "react-native";
import { ActionBtn, Text } from "../../../ui";
import type { OutputItem } from "./report";

export function OutputButtons({ outputs, onOpen }: { outputs: readonly OutputItem[]; onOpen: (output: OutputItem) => void }) {
  if (!outputs.length) return null;
  return <View style={{ gap: 8 }}><Text color="fg-3" style={{ fontSize: 13, lineHeight: 18 }}>Made overnight</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }} style={{ marginVertical: -6 }}>
      {outputs.map((item, index) => <ActionBtn key={item.id} icon={item.icon} active={index === 0} accessibilityLabel={`Open ${item.title}`} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }} onPress={() => onOpen(item)}>{item.title}</ActionBtn>)}
    </ScrollView>
  </View>;
}
