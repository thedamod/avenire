import { BlurView } from "expo-blur";
import { StyleSheet } from "react-native";
/** iOS uses native blur. Android retains Expo's tint fallback until a screen supplies a blur target. */
export function GlassBackdrop() {
  return (
    <BlurView pointerEvents="none" tint="dark" intensity={16} style={StyleSheet.absoluteFill} />
  );
}
