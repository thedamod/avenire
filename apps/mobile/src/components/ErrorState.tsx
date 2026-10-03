import { Pressable, Text, View } from "react-native";

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <View className="gap-2 rounded-2xl border border-destructive/30 bg-card p-4">
      <Text className="font-medium text-destructive">{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text className="font-semibold text-primary">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
