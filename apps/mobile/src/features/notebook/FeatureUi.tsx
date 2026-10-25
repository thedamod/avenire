import { View } from "react-native";
import {
  Button,
  ErrorState,
  GlassButton,
  GlassHeader,
  SheetHeader,
  type GlassHeaderProps,
} from "../../ui";

/** Keep Paper's visual sizes while giving small glass controls a 44pt hit area. */
export function FeatureHeader({
  onBack,
  backIcon = "back",
  leading,
  trailing,
  ...props
}: GlassHeaderProps) {
  return (
    <GlassHeader
      {...props}
      backIcon={backIcon}
      {...(onBack ? { onBack } : {})}
      leading={
        leading ??
        (onBack ? (
          <GlassButton
            icon={backIcon}
            accessibilityLabel={backIcon === "close" ? "Close" : "Back"}
            onPress={onBack}
            hitSlop={2}
          />
        ) : undefined)
      }
      {...(trailing
        ? {
            trailing: trailing.map((action) => ({
              ...action,
              hitSlop: action.hitSlop ?? Math.max(0, (44 - (action.size ?? 40)) / 2),
            })),
          }
        : {})}
    />
  );
}

export function FeatureSheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <SheetHeader
      title={title}
      trailing={
        <GlassButton
          icon="close"
          size={34}
          hitSlop={5}
          accessibilityLabel="Close sheet"
          onPress={onClose}
        />
      }
    />
  );
}

export function FeatureErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <ErrorState message={message} />
      {onRetry ? (
        <Button
          accessibilityLabel="Try again"
          variant="ghost"
          onPress={onRetry}
          style={{ height: 44, alignSelf: "flex-start" }}
        >
          Try again
        </Button>
      ) : null}
    </View>
  );
}
