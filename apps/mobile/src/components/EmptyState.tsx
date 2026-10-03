import { Text, View } from "react-native";

export function EmptyState({ title, description }: { readonly title: string; readonly description?: string }) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-border bg-card px-5 py-8">
      <Text className="text-center font-semibold text-foreground">{title}</Text>
      {description ? <Text className="text-center text-sm text-muted-foreground">{description}</Text> : null}
    </View>
  );
}
