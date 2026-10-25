import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Wordmark } from "../features/onboarding/Wordmark";

/** Full-screen loading state: the onboarding mesh with the static wordmark, matching the native splash. */
export function BootScreen({ onReady }: { onReady?: () => void }) {
  return (
    <View
      accessibilityLabel="Loading Avenire"
      style={{ flex: 1, backgroundColor: "#06111F", alignItems: "center", justifyContent: "center" }}
    >
      <Image
        source={require("../../assets/onboarding/mesh-welcome.jpg")}
        contentFit="cover"
        contentPosition={{ left: "30%", top: "50%" }}
        pointerEvents="none"
        accessible={false}
        {...(onReady ? { onDisplay: onReady } : {})}
        style={StyleSheet.absoluteFill}
      />
      <Wordmark width={240} />
    </View>
  );
}
