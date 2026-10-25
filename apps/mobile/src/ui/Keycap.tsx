import { View } from "react-native";
import { colors } from "../theme/tokens";
import { Text } from "./Text";
export function Keycap({ children }: { children: string }) {
  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 4,
        borderWidth: 1,
        borderColor: colors["line-2"],
        borderRadius: 4,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="mono" style={{ fontSize: 10 }}>
        {children}
      </Text>
    </View>
  );
}
