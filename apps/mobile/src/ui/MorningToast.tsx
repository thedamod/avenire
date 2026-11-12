import { useId } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import Animated, { FadeInDown, FadeOutUp, ReduceMotion } from "react-native-reanimated";
import { colors } from "../theme/tokens";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
import { nightArtSvg } from "./nightArt";
export interface MorningToastProps {
  title?: string;
  subtitle?: string;
  failed?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}
export function MorningToast({
  title,
  subtitle,
  failed = false,
  onPress,
  style,
}: MorningToastProps) {
  const id = useId().replace(/:/g, "");
  return (
    <Animated.View
      entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(150).reduceMotion(ReduceMotion.System)}
      style={[failed ? undefined : { boxShadow: "0px 0px 28px #5165D833" }, style]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={{
          height: 64,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: failed ? colors["line-2"] : "#C8D7FF29",
          overflow: "hidden",
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: failed ? colors["surface-2"] : "#151443",
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
          <>
            <LinearGradient
              pointerEvents="none"
              colors={["#07152F", "#151443", "#32155B"]}
              start={{ x: 0.067, y: 0 }}
              end={{ x: 0.738, y: 1.5 }}
              style={StyleSheet.absoluteFill}
            />
            <SvgXml
              pointerEvents="none"
              width="100%"
              height={64}
              xml={nightArtSvg.replace(/ng([ABCD])/g, `ng${id}$1`)}
              style={StyleSheet.absoluteFill}
            />
          </>
        )}
        <View
          style={{
            width: 30,
            height: 30,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            backgroundColor: failed ? "#FFFFFF0F" : "#E4EAFF1A",
            borderWidth: 1,
            borderColor: failed ? "#FFFFFF14" : "#E4EAFF24",
          }}
        >
          <Icon
            name="moon"
            size={16}
            color={failed ? colors["fg-2"] : "#E4EAFF"}
            strokeWidth={1.4}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              lineHeight: 18,
              fontWeight: "500",
              color: failed ? colors.fg : "#F4F6FF",
            }}
          >
            {title ??
              (failed ? "Last night's run didn't finish." : "Ava finished 3 things overnight.")}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, lineHeight: 16, color: failed ? colors["fg-2"] : "#C8D0F0" }}
          >
            {subtitle ??
              (failed
                ? "Two PDFs wouldn't open. Nothing changed."
                : "Summary, quiz and revision notes")}
          </Text>
        </View>
        {failed ? (
          <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: "500", color: colors.fg }}>
            Details
          </Text>
        ) : (
          <Icon name="chevR" color="#F4F6FF" strokeWidth={1.6} />
        )}
      </Pressable>
    </Animated.View>
  );
}
