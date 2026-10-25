import type { ReactNode } from "react";
import { View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { colors } from "../theme/tokens";
import { Icon } from "./Icon";
import { Pressable, type PressableProps } from "./Pressable";
import { Text } from "./Text";
export interface ListRowProps extends Omit<PressableProps, "children"> {
  title: string;
  subtitle?: string;
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  leadingWidth?: number;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}
export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  chevron = false,
  leadingWidth = 24,
  titleStyle,
  subtitleStyle,
  style,
  ...props
}: ListRowProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole={props.onPress ? "button" : undefined}
      style={(state) => [
        {
          minHeight: 56,
          paddingVertical: 11,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {leading ? (
        <View style={{ width: leadingWidth, alignItems: "center", flexShrink: 0 }}>{leading}</View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1} style={titleStyle}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" numberOfLines={1} style={subtitleStyle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text variant="meta" numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      {trailing}
      {chevron ? (
        <View style={{ width: 16, alignItems: "flex-end" }}>
          <Icon name="chevR" size={12} color={colors["fg-3"]} />
        </View>
      ) : null}
    </Pressable>
  );
}
/** Home thread layout: context above a 16/21 title, with optional working state. */
export interface ThreadRowProps extends Omit<PressableProps, "children"> {
  title: string;
  meta: string;
  right?: string;
  subtitle?: string;
  leading?: ReactNode;
  titleLeading?: ReactNode;
}
export function ThreadRow({
  title,
  meta,
  right,
  subtitle,
  leading,
  titleLeading,
  style,
  ...props
}: ThreadRowProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      style={(state) => [
        { paddingTop: 11, paddingBottom: 12, paddingHorizontal: 20, gap: 3 },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {leading}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17 }}>
          {meta}
        </Text>
        {right ? <Text variant="meta">{right}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        {titleLeading}
        <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text variant="meta" style={{ fontSize: 13, lineHeight: 17 }}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}
export function Divider({ inset = 20 }: { inset?: number }) {
  return (
    <View style={{ height: 1, marginLeft: inset, backgroundColor: colors.line, flexShrink: 0 }} />
  );
}
export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          paddingTop: 22,
          paddingBottom: 8,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
        },
        style,
      ]}
    >
      <Text variant="section">{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <Text variant="meta" style={{ fontSize: 13, lineHeight: 18 }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
