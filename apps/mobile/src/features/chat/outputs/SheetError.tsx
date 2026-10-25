import { View } from "react-native";
import { Button, ErrorState } from "../../../ui";

/** Local until the shared ErrorState retry action exposes a 44pt touch target. */
export function SheetError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <ErrorState message={message} />
      {onRetry ? (
        <Button
          variant="ghost"
          accessibilityLabel="Try again"
          hitSlop={6}
          style={{ alignSelf: "flex-start", minWidth: 44 }}
          onPress={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </View>
  );
}
