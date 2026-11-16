import { useId } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
} from "react-native-reanimated";
import type { CloudRun } from "@avenire/contracts";
import { Icon, Pressable, Text } from "../../ui";
import { nightArtSvg } from "../../ui/nightArt";

/** Mirrors MorningToast, with an explicit accessible label and real run copy. */
export function HomeToast({
  run,
  onPress,
}: {
  run: CloudRun;
  onPress: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const failed = run.status === "failed";
  const title = failed
    ? "Last night's run didn't finish."
    : `Ava finished ${run.assets.length} ${run.assets.length === 1 ? "thing" : "things"} overnight.`;
  const names = run.assets.map((asset) => asset.title);
  const summary =
    run.summary ??
    (names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0]) ??
    "Open morning report";
  const subtitle = failed
    ? `${run.error?.split(/(?<=\.)\s/)[0] ?? "The run couldn't finish."} Nothing changed.`
    : summary;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)
        .easing(Easing.out(Easing.cubic))
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(150).reduceMotion(ReduceMotion.System)}
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        ...(failed ? {} : { boxShadow: "0px 0px 28px #5165D833" }),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} ${subtitle} ${failed ? "View task details" : "Open morning report"}`}
        onPress={onPress}
        style={{
          height: 64,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: failed ? "#2E2E2E" : "#C8D7FF29",
          overflow: "hidden",
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: failed ? "#161616" : "#151443",
        }}
      >
        {failed ? (
          <LinearGradient
            pointerEvents="none"
            colors={["#17171C", "#1C1C24"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <SvgXml
            pointerEvents="none"
            xml={nightArtSvg.replace(/ng([ABCD])/g, `ng${id}$1`)}
            width="100%"
            height={64}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: failed ? "#FFFFFF0F" : "#E4EAFF1A",
            borderWidth: 1,
            borderColor: failed ? "#FFFFFF14" : "#E4EAFF24",
          }}
        >
          <Icon name="moon" color={failed ? "#A3A3A3" : "#E4EAFF"} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              lineHeight: 18,
              fontWeight: "500",
              color: failed ? "#EDEDED" : "#F4F6FF",
            }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              lineHeight: 16,
              color: failed ? "#A3A3A3" : "#C8D0F0",
            }}
          >
            {subtitle}
          </Text>
        </View>
        {failed ? (
          <Text variant="label" color="fg">
            Details
          </Text>
        ) : (
          <Icon name="chevR" color="#F4F6FF" strokeWidth={1.6} />
        )}
      </Pressable>
    </Animated.View>
  );
}
