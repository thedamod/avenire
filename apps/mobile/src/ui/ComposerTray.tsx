import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { colors, motion } from "../theme/tokens";
import { Button, type ButtonVariant } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
export interface TrayAction {
  key: string;
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
}
export interface TrayRow {
  key: string;
  label: string;
  detail?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  actions?: readonly TrayAction[];
  onPress?: () => void;
  selected?: boolean;
}
export interface ComposerTrayProps {
  title: string;
  meta?: string;
  icon?: IconName;
  tone?: "ruth" | "danger";
  step?: string;
  expanded?: boolean;
  onToggle?: () => void;
  rows?: readonly TrayRow[];
  children?: ReactNode;
  inlineAction?: TrayAction | undefined;
  actions?: readonly TrayAction[];
  startAction?: TrayAction;
  style?: StyleProp<ViewStyle>;
}
function TrayActionButton({ action }: { action: TrayAction }) {
  return (
    <Button
      variant={action.variant ?? "secondary"}
      onPress={action.onPress}
      disabled={action.disabled}
      busy={Boolean(action.busy)}
    >
      {action.label}
    </Button>
  );
}
/** Presentational only: callers own expansion, approval state, and mutations. */
export function ComposerTray({
  title,
  meta,
  icon = "moon",
  tone = "ruth",
  step,
  expanded = false,
  onToggle,
  rows = [],
  children,
  inlineAction,
  actions = [],
  startAction,
  style,
}: ComposerTrayProps) {
  return (
    <Animated.View
      layout={LinearTransition.duration(200)
        .easing(Easing.bezier(...motion.easing.drawer))
        .reduceMotion(ReduceMotion.System)}
      entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutDown.duration(150).reduceMotion(ReduceMotion.System)}
      style={[styles.tray, style]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: inlineAction ? "center" : "flex-start",
          gap: 10,
        }}
      >
        <View style={{ width: 16, height: 18, justifyContent: "center", alignItems: "center" }}>
          <Icon name={icon} size={15} color={tone === "danger" ? colors.red : colors.accent} />
        </View>
        <Pressable
          onPress={onToggle}
          accessibilityRole={onToggle ? "button" : undefined}
          accessibilityLabel={onToggle ? `${expanded ? "Collapse" : "Expand"} ${title}` : undefined}
          style={{ flex: 1, minWidth: 0, gap: 1 }}
        >
          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.fg }}>
            {title}
          </Text>
          {meta ? (
            <Text variant="meta" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </Pressable>
        {step ? (
          <Text variant="mono" color="fg-3" style={{ paddingTop: 2 }}>
            {step}
          </Text>
        ) : null}
        {inlineAction ? <TrayActionButton action={inlineAction} /> : null}
        {onToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? "Collapse" : "Expand"} tray`}
            accessibilityState={{ expanded }}
            onPress={onToggle}
            hitSlop={8}
            style={{ width: 20, height: 18, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={expanded ? "chevD" : "chevU"} size={14} />
          </Pressable>
        ) : null}
      </View>
      {expanded ? (
        <>
          {children}
          {rows.length ? (
            <View>
              {rows.map((row) => (
                <Pressable
                  key={row.key}
                  onPress={row.onPress}
                  accessibilityRole={row.onPress ? "button" : undefined}
                  accessibilityState={{ selected: row.selected }}
                  style={styles.row}
                >
                  {row.leading ? (
                    <View style={{ width: 16, alignItems: "center", flexShrink: 0 }}>
                      {row.leading}
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 13.5,
                        lineHeight: 18,
                        fontWeight: "500",
                        color: colors.fg,
                      }}
                    >
                      {row.label}
                    </Text>
                    {row.detail ? (
                      <Text variant="meta" numberOfLines={1}>
                        {row.detail}
                      </Text>
                    ) : null}
                  </View>
                  {row.trailing}
                  {row.selected ? <Icon name="check" color={colors.accent} /> : null}
                  {row.actions?.map((action) => (
                    <TrayActionButton key={action.key} action={action} />
                  ))}
                </Pressable>
              ))}
            </View>
          ) : null}
          {actions.length || startAction ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 }}>
              {startAction ? <TrayActionButton action={startAction} /> : null}
              <View style={{ flex: 1 }} />
              {actions.map((action) => (
                <TrayActionButton key={action.key} action={action} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  tray: {
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#141414",
    borderColor: "#2A2A2A",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 10,
  },
  row: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
