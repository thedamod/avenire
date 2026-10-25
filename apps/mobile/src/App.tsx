import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { PostHogProvider } from "posthog-react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useFonts } from "expo-font";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { ApiProvider } from "./state/api";
import { RootStack } from "./Stack";
import { colors } from "./theme/tokens";
import { BootScreen } from "./ui/BootScreen";
import { Text } from "./ui/Text";
import "../global.css";

// Hold the native splash until the first real frame, then fade into the boot screen.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });
const hideSplash = () => void SplashScreen.hideAsync().catch(() => undefined);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ GeistMono: GeistMono_400Regular });
  const config = Constants.expoConfig?.extra;
  useEffect(() => {
    if (fontsLoaded || fontError) hideSplash();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return <BootScreen onReady={hideSplash} />;
  if (fontError)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: "center" }}>
        <Text color="red">Could not load the bundled font. Please reopen Avenire.</Text>
      </View>
    );
  const content = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ApiProvider>
            <StatusBar style="light" />
            <RootStack />
          </ApiProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  return config?.posthogKey ? (
    <PostHogProvider
      apiKey={String(config.posthogKey)}
      options={{ host: String(config.posthogHost ?? "https://us.i.posthog.com") }}
    >
      {content}
    </PostHogProvider>
  ) : (
    content
  );
}
