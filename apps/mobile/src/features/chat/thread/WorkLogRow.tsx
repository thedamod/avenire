import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, motion } from "../../../theme/tokens";
import { Icon, Pressable, Text, type IconName } from "../../../ui";
import type { WorkEntry, WorkIcon } from "./types";
import { activitySummary, groupWorkEntries } from "./workGroups";

const icons: Record<WorkIcon, IconName> = {
  search: "search",
  read: "doc",
  list: "lines",
  write: "pencil",
  move: "move",
  rename: "pencil",
  trash: "trash",
  code: "lines",
  widget: "widget",
  image: "image",
  video: "video",
  computer: "laptop",
  skill: "doc",
  page: "doc",
  question: "help",
  tool: "ring",
};

/** Same geometry as the web ToolActivity: three 22pt rows, newest at the bottom. */
const ROW = 22;
const VISIBLE = 3;

/** One block of tool activity: a row per kind of work, like web's ToolActivity. */
export function WorkActivity({ entries }: { entries: readonly WorkEntry[] }) {
  const groups = useMemo(() => groupWorkEntries(entries), [entries]);
  return (
    <View accessibilityLabel="Tool activity">
      {groups.map((entry) => (
        <WorkLogRow key={entry.id} entry={entry} />
      ))}
    </View>
  );
}

export function WorkLogRow({ entry }: { entry: WorkEntry }) {
  const [expanded, setExpanded] = useState(false);
  const running = entry.status === "running";
  const summary = activitySummary(entry);
  const tint = running || entry.status === "waiting" ? colors.accent : colors["fg-3"];
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.label}, ${summary}, ${entry.status}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        hitSlop={7}
        style={{ minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <View style={{ width: 14, flexShrink: 0 }}>
          {running ? (
            <Icon name="spinner" size={14} color={tint} />
          ) : (
            <Icon name={icons[entry.icon]} size={14} strokeWidth={1.4} color={tint} />
          )}
        </View>
        <Text
          numberOfLines={1}
          color={running ? "accent-text" : entry.status === "error" ? "fg-3" : "fg-2"}
          style={{ flexShrink: 1, fontSize: entry.status === "error" ? 12 : 14, lineHeight: 19 }}
        >
          {entry.label}
        </Text>
        {summary ? (
          <Text variant="meta" style={{ flexShrink: 0 }}>
            {summary}
          </Text>
        ) : null}
        <Icon name={expanded ? "chevD" : "chevR"} size={12} color={colors["fg-3"]} />
      </Pressable>
      {running && !expanded ? (
        <RollingWindow labels={entry.calls.map((call) => call.label)} />
      ) : null}
      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(150)
            .easing(Easing.bezier(...motion.easing.out))
            .reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          style={{
            borderLeftWidth: 1,
            borderLeftColor: colors.line,
            paddingLeft: 12,
            marginLeft: 7,
            marginBottom: 8,
            paddingVertical: 4,
            gap: 8,
          }}
        >
          {entry.calls.map((call) => (
            <View key={call.id} style={{ gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 18 }} color="fg-2">
                  {call.label}
                </Text>
                {call.status === "running" ? (
                  <Icon name="spinner" size={12} color={colors["fg-3"]} />
                ) : null}
                {call.status === "error" ? <Text variant="meta">Unsuccessful attempt</Text> : null}
              </View>
              {call.detail ? (
                <Text selectable variant="meta" numberOfLines={12}>
                  {call.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Latest steps roll up through a fixed three-row window, fading out at the top. */
function RollingWindow({ labels }: { labels: readonly string[] }) {
  const reduced = useReducedMotion();
  const target = labels.length > VISIBLE ? -(labels.length - VISIBLE) * ROW : 0;
  const y = useSharedValue(target);
  useEffect(() => {
    y.set(reduced ? target : withSpring(target, { damping: 20, mass: 0.5, stiffness: 160 }));
  }, [target, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: ROW * Math.min(VISIBLE, labels.length),
        overflow: "hidden",
        marginLeft: 7,
        marginBottom: 4,
        borderLeftWidth: 1,
        borderLeftColor: colors.line,
        paddingLeft: 12,
      }}
    >
      <Animated.View style={style}>
        {labels.map((label) => (
          <Text
            key={label}
            numberOfLines={1}
            variant="meta"
            style={{ height: ROW, lineHeight: ROW }}
          >
            {label}
          </Text>
        ))}
      </Animated.View>
      {labels.length > VISIBLE ? (
        <LinearGradient
          pointerEvents="none"
          colors={[colors.bg, `${colors.bg}00`]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW }}
        />
      ) : null}
    </View>
  );
}
