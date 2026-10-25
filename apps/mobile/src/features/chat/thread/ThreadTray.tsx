import type { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { colors, motion } from "../../../theme/tokens";
import { Button, Icon, Pressable, ScrollFade, Text, type ButtonProps, type IconName } from "../../../ui";

export function TrayButton(props: ButtonProps) {
  return <Button hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }} accessibilityLabel={typeof props.children === "string" ? props.children : undefined} {...props} />;
}

/** Local version of ComposerTray: the toggle, rows and actions all have 44pt targets. */
export function ThreadTray({ title, meta, expanded, onToggle, step, inline, footer, children, icon = "moon" }: PropsWithChildren<{
  title: string; meta?: string; expanded: boolean; onToggle: () => void;
  step?: string | undefined; inline?: ReactNode; footer?: ReactNode; icon?: IconName;
}>) {
  return (
    <Animated.View entering={FadeIn.duration(200).easing(Easing.bezier(...motion.easing.out)).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)} style={styles.tray}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`} accessibilityState={{ expanded }} onPress={onToggle} style={styles.toggle}>
          <Icon name={icon} size={15} color={colors.accent} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={{ fontSize: 13.5, lineHeight: 17, fontWeight: "600", color: colors.fg }} numberOfLines={2}>{title}</Text>
            {meta ? <Text variant="meta">{meta}</Text> : null}
          </View>
          {step ? <Text variant="mono" color="fg-3">{step}</Text> : null}
          {inline}
          <Icon name={expanded ? "chevD" : "chevU"} size={14} color={colors["fg-3"]} />
        </Pressable>
      </View>
      {expanded ? <Animated.View entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)} style={{ gap: 8 }}>
        <ScrollFade style={{ flex: undefined, maxHeight: 168 }} size={12} color="#141414" top={false}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </ScrollFade>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View> : null}
    </Animated.View>
  );
}

export function TrayRow({ title, detail, leading, trailing, selected, onPress }: {
  title: string; detail?: string | null; leading?: ReactNode; trailing?: ReactNode;
  selected?: boolean; onPress?: () => void;
}) {
  const content = <>
    {leading ? <View style={{ width: 16, flexShrink: 0, alignItems: "center" }}>{leading}</View> : null}
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <Text numberOfLines={2} style={{ fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: colors.fg }}>{title}</Text>
      {detail ? <Text variant="meta">{detail}</Text> : null}
    </View>
    {trailing}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={[title, detail].filter(Boolean).join(", ")} accessibilityState={{ selected }} onPress={onPress} style={styles.row}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  // The desktop ComposerTray: a drop-up inset from the composer, rounded on top only, with its
  // bottom 16pt tucked behind the composer so no square corners show.
  tray: { marginHorizontal: 12, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 28, backgroundColor: "#141414", borderWidth: 1, borderBottomWidth: 0, borderColor: "#2A2A2A", borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 4 },  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  toggle: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10 },
  row: { minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  footer: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
});

/** "Ruth stopped": errors get the same drop-up as approvals, with Retry (desktop ErrorTray). */
export function ErrorTray({ message, onRetry, onDismiss }: { message: string; onRetry: () => void; onDismiss?: (() => void) | undefined }) {
  return (
    <Animated.View entering={FadeIn.duration(200).easing(Easing.bezier(...motion.easing.out)).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)} style={[styles.tray, { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 }]}>
      <Icon name="help" size={15} color={colors.red} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ fontSize: 13.5, lineHeight: 17, fontWeight: "600", color: colors.fg }}>Ruth stopped</Text>
        <Text variant="meta" numberOfLines={2}>{message}</Text>
      </View>
      {onDismiss ? <TrayButton variant="ghost" onPress={onDismiss}>Dismiss</TrayButton> : null}
      <TrayButton onPress={onRetry}>Retry</TrayButton>
    </Animated.View>
  );
}
