import { View } from "react-native";
import { Text } from "../../../ui";
import type { AttachmentChip } from "./types";

export function UserBubble({ text, attachments = [] }: { text: string; attachments?: readonly AttachmentChip[] }) {
  return <View style={{ alignItems: "flex-end", paddingLeft: 48 }}>
    <View style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.04)", gap: 6 }}>
      {text ? <Text selectable color="fg" style={{ fontSize: 15, lineHeight: 21 }}>{text}</Text> : null}
      {attachments.map((item, index) => <Text key={`${item.url}:${index}`} variant="meta" color="fg-2">{item.name}</Text>)}
    </View>
  </View>;
}
