import type { ReactNode } from "react";
import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, Path, Pattern, Rect } from "react-native-svg";
import { colors, notebookColors } from "../theme/tokens";
import { coverPaths, type CoverDrawing } from "./coverPaths";
import { Pressable } from "./Pressable";
import { Icon } from "./Icon";
import { Text } from "./Text";
export { type CoverDrawing } from "./coverPaths";
export interface NotebookCoverProps {
  title: string;
  color?: string;
  drawing?: CoverDrawing;
  figure?: ReactNode;
  notes?: number;
  sources?: number;
  meta?: string;
  width?: number;
  height?: number;
  ink?: string;
  compact?: boolean;
  artSize?: number;
  onPress?: () => void;
}
export function NotebookCover({
  title,
  color = notebookColors.thermo,
  drawing = "thermo",
  figure,
  notes,
  sources,
  meta,
  compact = false,
  width = compact ? 64 : 120,
  height = compact ? 84 : 156,
  artSize = compact ? 44 : 64,
  ink = color === notebookColors.options
    ? "#FFFFFF"
    : color === notebookColors.ochem
      ? "#1A1206"
      : color === notebookColors.research
        ? "#160C26"
        : "#111111",
  onPress,
}: NotebookCoverProps) {
  const id = `hatch-${useId().replace(/:/g, "")}`;
  const label =
    meta ??
    [
      notes !== undefined ? `${notes} notes` : undefined,
      sources !== undefined ? `${sources} sources` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}${label ? `, ${label.replace(/\n/g, ", ")}` : ""}`}
      onPress={onPress}
      style={{
        width,
        height,
        flexShrink: 0,
        overflow: "hidden",
        borderTopLeftRadius: compact ? 2 : 3,
        borderBottomLeftRadius: compact ? 2 : 3,
        borderTopRightRadius: compact ? 6 : 8,
        borderBottomRightRadius: compact ? 6 : 8,
        backgroundColor: color,
      }}
    >
      <Svg pointerEvents="none" width={width} height={height} style={{ position: "absolute" }}>
        <Defs>
          <Pattern
            id={id}
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Path
              d="M0 0V7"
              stroke="#FFFFFF"
              strokeOpacity={
                color === notebookColors.options
                  ? 0.07
                  : color === notebookColors.ochem || color === notebookColors.research
                    ? 0.09
                    : 0.08
              }
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: Math.max(5, Math.round(width / 16)),
          backgroundColor:
            color === notebookColors.ochem || color === notebookColors.research
              ? "#00000029"
              : "#00000033",
        }}
      />
      {!compact ? (
        <Text
          style={{
            position: "absolute",
            left: Math.round(width * 0.14),
            top: Math.round(width * 0.11),
            width: width - Math.round(width * 0.14) - 6,
            fontSize: width >= 100 ? 12 : 11,
            lineHeight: width >= 100 ? 16 : 13,
            fontWeight: "600",
            color: ink,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          position: "absolute",
          right: compact ? 6 : Math.round(width * 0.03),
          bottom: compact ? 18 : Math.round(height * 0.12),
          width: artSize,
          height: artSize,
        }}
      >
        {figure ?? (
          <Svg width={artSize} height={artSize} viewBox="0 0 120 120">
            <Path
              d={
                compact && drawing === "thermo"
                  ? coverPaths.thermo.slice(0, coverPaths.thermo.indexOf("m-12-28.1"))
                  : coverPaths[drawing]
              }
              fill="none"
              stroke="#00000080"
              strokeWidth={compact ? 2 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </View>
      {label && !compact ? (
        <Text
          variant="mono"
          style={{
            position: "absolute",
            left: Math.round(width * 0.14),
            bottom: Math.round(height * 0.06),
            fontSize: 9.5,
            lineHeight: 12,
            letterSpacing: 0.38,
            color: ink === "#FFFFFF" ? "#FFFFFFB3" : "#00000099",
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
export function NewNotebookTile({
  onPress,
  width = 120,
  height = 156,
}: {
  onPress: () => void;
  width?: number;
  height?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New notebook"
      onPress={onPress}
      style={{
        width,
        height,
        flexShrink: 0,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors["line-2"],
        borderTopLeftRadius: 3,
        borderBottomLeftRadius: 3,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <Icon name="plus" size={18} strokeWidth={1.4} />
      <Text variant="meta">New notebook</Text>
    </Pressable>
  );
}
