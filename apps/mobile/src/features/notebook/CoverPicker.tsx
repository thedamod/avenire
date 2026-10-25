import { ScrollView, View } from "react-native";
import type { FolderColor, FolderCover } from "@avenire/contracts";
import { NotebookCover, Pressable, Text } from "../../ui";
import { CoverGlyph } from "./CoverGlyph";

export const coverColors: Record<FolderColor, string> = {
  blue: "#2B9BD8",
  pink: "#EF4579",
  green: "#18803A",
  yellow: "#D9A50D",
  purple: "#B48BF2",
  orange: "#E8842C",
  teal: "#2BB5A5",
  gray: "#A3A3A3",
};
const colorOptions = Object.keys(coverColors) as FolderColor[];
const coverOptions: FolderCover[] = ["cradle", "flask", "globe", "compass", "book", "atom", "none"];

export function NotebookPreview({
  name,
  color,
  cover,
  compact = false,
  onPress,
}: {
  name: string;
  color: FolderColor;
  cover: FolderCover;
  compact?: boolean;
  onPress?: () => void;
}) {
  return (
    <NotebookCover
      title={name}
      color={coverColors[color]}
      compact={compact}
      width={compact ? 64 : 132}
      height={compact ? 84 : 172}
      artSize={compact ? 44 : 72}
      {...(!compact ? { meta: "Empty" } : {})}
      figure={<CoverGlyph cover={cover} size={compact ? 44 : 72} />}
      {...(onPress ? { onPress } : {})}
    />
  );
}

export function CoverPicker({
  color,
  cover,
  onColor,
  onCover,
}: {
  color: FolderColor;
  cover: FolderCover;
  onColor: (value: FolderColor) => void;
  onCover: (value: FolderCover) => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 2 }}>
        <Text variant="label">Colour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", paddingVertical: 8 }}>
            {colorOptions.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={`${option} cover`}
                accessibilityState={{ selected: color === option }}
                onPress={() => onColor(option)}
                style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    padding: 2,
                    borderRadius: 19,
                    borderWidth: 1.5,
                    borderColor: color === option ? "#EDEDED" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: coverColors[option],
                    }}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ gap: 10 }}>
        <Text variant="label">Cover drawing</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {coverOptions.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={`${option} drawing`}
                accessibilityState={{ selected: cover === option }}
                onPress={() => onCover(option)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderStyle: option === "none" ? "dashed" : "solid",
                  borderColor: cover === option ? "#EDEDED" : "#2E2E2E",
                  backgroundColor: cover === option ? "#242424" : "transparent",
                }}
              >
                {option === "none" ? (
                  <Text style={{ fontSize: 11 }}>None</Text>
                ) : (
                  <CoverGlyph
                    cover={option}
                    size={38}
                    color={cover === option ? "#EDEDED" : "#A3A3A3"}
                  />
                )}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
