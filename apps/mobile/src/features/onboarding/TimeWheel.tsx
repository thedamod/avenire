import { useEffect, useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { colors } from "../../theme/tokens";
import { Pressable, ScrollFade, Text } from "../../ui";

const ROW_HEIGHT = 44;
const HALF_DAY = 12 * 60;
const times = Array.from({ length: 24 }, (_, index) => index * 30);
const wrapDay = (minutes: number) => ((minutes % 1440) + 1440) % 1440;

export function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatReportTime(minutes: number) {
  return `${formatTime(minutes)} ${minutes < HALF_DAY ? "AM" : "PM"}`;
}

/** M34's five-row wheel, including independent AM/PM and screen-reader adjustments. */
export function TimeWheel({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const selected = Math.floor((value % HALF_DAY) / 30);
  const period = value >= HALF_DAY ? HALF_DAY : 0;

  useEffect(() => {
    scroll.current?.scrollTo({ y: selected * ROW_HEIGHT, animated: false });
  }, [selected]);

  const select = (index: number) => {
    onChange(index * 30 + period);
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(
      0,
      Math.min(times.length - 1, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)),
    );
    onChange(index * 30 + period);
  };

  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.selection} />
      <View style={styles.columns}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Morning report time"
          accessibilityValue={{ text: formatReportTime(value) }}
          accessibilityHint="Swipe up or down to adjust by thirty minutes"
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === "increment") onChange(wrapDay(value + 30));
            if (nativeEvent.actionName === "decrement") onChange(wrapDay(value - 30));
          }}
          style={styles.timeColumn}
        >
          <ScrollFade size={40} color={colors.bg}>
            <ScrollView
              ref={scroll}
              showsVerticalScrollIndicator={false}
              snapToInterval={ROW_HEIGHT}
              decelerationRate="fast"
              nestedScrollEnabled
              bounces={false}
              contentOffset={{ x: 0, y: selected * ROW_HEIGHT }}
              contentContainerStyle={{ paddingVertical: ROW_HEIGHT * 2 }}
              onMomentumScrollEnd={settle}
              onScrollEndDrag={(event) => {
                // A drag without momentum must save its snapped value too.
                if (event.nativeEvent.velocity?.y === 0) settle(event);
              }}
            >
              {times.map((minutes, index) => {
                const distance = Math.abs(index - selected);
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="button"
                    accessibilityLabel={`Set report time to ${formatTime(minutes)} ${period === 0 ? "AM" : "PM"}`}
                    accessibilityState={{ selected: index === selected }}
                    onPress={() => select(index)}
                    style={styles.timeRow}
                  >
                    <Text
                      color="fg"
                      style={{
                        fontSize: distance === 0 ? 24 : distance === 1 ? 19 : 16,
                        lineHeight: 28,
                        fontWeight: distance === 0 ? "600" : "400",
                        opacity: distance === 0 ? 1 : distance === 1 ? 0.5 : 0.25,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatTime(minutes)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </ScrollFade>
        </View>
        <View
          accessibilityLabel="Time of day"
          style={[styles.periodColumn, { paddingTop: ROW_HEIGHT * (period === 0 ? 2 : 1) }]}
        >
          {([0, HALF_DAY] as const).map((nextPeriod) => (
            <Pressable
              key={nextPeriod}
              accessibilityRole="tab"
              accessibilityLabel={nextPeriod === 0 ? "AM" : "PM"}
              accessibilityState={{ selected: period === nextPeriod }}
              onPress={() => onChange((value % HALF_DAY) + nextPeriod)}
              style={styles.periodRow}
            >
              <Text
                color="fg"
                style={{
                  fontSize: period === nextPeriod ? 24 : 19,
                  lineHeight: 28,
                  fontWeight: period === nextPeriod ? "600" : "400",
                  opacity: period === nextPeriod ? 1 : 0.5,
                }}
              >
                {nextPeriod === 0 ? "AM" : "PM"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { marginTop: 40, marginHorizontal: 24, height: ROW_HEIGHT * 5 },
  selection: {
    position: "absolute",
    top: ROW_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    borderRadius: 10,
    backgroundColor: colors["surface-3"],
  },
  columns: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 22 },
  timeColumn: { width: 70 },
  timeRow: { height: ROW_HEIGHT, minWidth: 44, justifyContent: "center", alignItems: "flex-end" },
  periodColumn: { width: 44 },
  periodRow: { height: ROW_HEIGHT, width: 44, justifyContent: "center", alignItems: "flex-start" },
});
