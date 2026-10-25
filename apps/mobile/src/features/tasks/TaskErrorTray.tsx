import { View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { colors, motion } from "../../theme/tokens";
import { Button, Icon, Pressable, Text } from "../../ui";

/** ComposerTray geometry with full-size, explicitly labelled header/action targets. */
export function TaskErrorTray({
  detail,
  expanded,
  onToggle,
  onEdit,
  onRetry,
  busy,
}: {
  detail: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(200)
        .easing(Easing.bezier(...motion.easing.out))
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(150).reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(200)
        .easing(Easing.bezier(...motion.easing.drawer))
        .reduceMotion(ReduceMotion.System)}
      style={{
        marginHorizontal: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: "#141414",
        borderColor: "#2A2A2A",
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        gap: 10,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} run error`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: 10 }}
      >
        <View style={{ width: 16, paddingTop: 2 }}>
          <Icon name="alert" size={15} color={colors.red} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text color="fg" style={{ fontSize: 14, lineHeight: 18, fontWeight: "600" }}>
            Run stopped
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Icon name={expanded ? "chevD" : "chevU"} size={14} />
      </Pressable>
      {expanded ? (
        <View
          style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12, paddingVertical: 6 }}
        >
          <Button
            variant="secondary"
            accessibilityLabel="Edit overnight task schedule"
            hitSlop={6}
            disabled={busy}
            onPress={onEdit}
          >
            Edit schedule
          </Button>
          <Button
            accessibilityLabel="Retry failed task now"
            hitSlop={6}
            busy={busy}
            onPress={onRetry}
          >
            Retry now
          </Button>
        </View>
      ) : null}
    </Animated.View>
  );
}
