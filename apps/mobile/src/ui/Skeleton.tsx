import { View, type DimensionValue } from "react-native";
import { colors } from "../theme/tokens";
export function Skeleton({
  width = "100%",
  height = 12,
  radius = 4,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: radius, backgroundColor: colors["surface-3"] }}
    />
  );
}
export function SkeletonRow() {
  return (
    <View
      accessibilityLabel="Loading"
      style={{ paddingHorizontal: 20, paddingVertical: 14, gap: 8 }}
    >
      <Skeleton width="42%" height={11} />
      <Skeleton width="82%" height={16} />
      <Skeleton width="60%" height={11} />
    </View>
  );
}
