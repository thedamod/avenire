import { View } from "react-native";
import { Aside } from "./Aside";
import { Button } from "./Button";
import { Text } from "./Text";
import { colors } from "../theme/tokens";
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Aside color={colors.red}>
      <View accessibilityRole="alert" style={{ gap: 8 }}>
        <Text color="red">{message}</Text>
        {onRetry ? (
          <Button variant="ghost" onPress={onRetry}>
            Try again
          </Button>
        ) : null}
      </View>
    </Aside>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
