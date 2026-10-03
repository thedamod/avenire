import { Pressable, Text, View } from "react-native";
import { Card } from "./Card";

export function ListRow({
  title,
  detail,
  onPress,
}: {
  readonly title: string;
  readonly detail?: string;
  readonly onPress?: () => void;
}) {
  const content = (
    <Card>
      <View className="gap-1">
        <Text className="font-semibold text-foreground">{title}</Text>
        {detail ? <Text className="text-sm text-muted-foreground">{detail}</Text> : null}
      </View>
    </Card>
  );

  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}
