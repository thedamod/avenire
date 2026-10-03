import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";

export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
}: PropsWithChildren<{
  readonly title?: string;
  readonly subtitle?: string;
  readonly scroll?: boolean;
}>) {
  const content = (
    <View className="gap-4 px-5 pb-8 pt-6">
      {title ? <Text className="text-3xl font-bold text-foreground">{title}</Text> : null}
      {subtitle ? <Text className="-mt-2 text-muted-foreground">{subtitle}</Text> : null}
      {children}
    </View>
  );

  return scroll ? (
    <ScrollView className="flex-1 bg-background" keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  ) : (
    <View className="flex-1 bg-background">{content}</View>
  );
}
