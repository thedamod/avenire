import { createStaticNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Button } from "./components/Button";
import { SignInScreen } from "./features/auth/SignInScreen";
import { TodayScreen } from "./features/today/TodayScreen";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { ClustersScreen } from "./features/clusters/ClustersScreen";
import { ClusterScreen } from "./features/clusters/ClusterScreen";
import { SearchScreen } from "./features/search/SearchScreen";
import { RuthScreen } from "./features/ruth/RuthScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { authClient } from "./state/auth";

import type { RootStackParamList } from "./navigation";

const tabs = ["Today", "Inbox", "Clusters", "Search", "Ruth", "Settings"] as const;
type TabName = (typeof tabs)[number];

function HomeTabs() {
  const [selectedTab, setSelectedTab] = useState<TabName>("Today");
  const selectedScreen = {
    Today: <TodayScreen />,
    Inbox: <InboxScreen />,
    Clusters: <ClustersScreen />,
    Search: <SearchScreen />,
    Ruth: <RuthScreen />,
    Settings: <SettingsScreen />,
  }[selectedTab];

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-14 border-b border-border"
        contentContainerClassName="items-center px-2"
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedTab === tab }}
            onPress={() => setSelectedTab(tab)}
            className="px-3 py-4"
          >
            <Text
              className={
                selectedTab === tab
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              }
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {selectedScreen}
    </View>
  );
}

const Navigator = createStaticNavigation(
  createNativeStackNavigator<RootStackParamList>({
    screens: {
      Home: { screen: HomeTabs, options: { headerShown: false } },
      Cluster: { screen: ClusterScreen, options: { title: "Cluster" } },
    },
  }),
);

function LoadingSession() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}

export function RootStack() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <LoadingSession />;
  return session?.user ? <Navigator /> : <SignInScreen />;
}
