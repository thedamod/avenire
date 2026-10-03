import { SafeAreaProvider } from "react-native-safe-area-context";
import { PostHogProvider } from "posthog-react-native";
import Constants from "expo-constants";
import { ApiProvider } from "./state/api";
import { RootStack } from "./Stack";
import "../global.css";

export default function App() {
  const config = Constants.expoConfig?.extra;
  const content = (
    <SafeAreaProvider>
      <ApiProvider>
        <RootStack />
      </ApiProvider>
    </SafeAreaProvider>
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
