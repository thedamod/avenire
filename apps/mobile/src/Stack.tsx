import { DarkTheme, NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { Platform, View } from "react-native";
import { SignInScreen } from "./features/auth/SignInScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { AskScreen } from "./features/ask/AskScreen";
import { NotebookScreen } from "./features/notebook/NotebookScreen";
import { NewNotebookSheet } from "./features/notebook/NewNotebookSheet";
import { NoteScreen } from "./features/notes/NoteScreen";
import { ChatScreen } from "./features/chat/ChatScreen";
import { OutputSheet } from "./features/chat/OutputSheet";
import { CitationSheet } from "./features/chat/CitationSheet";
import { TasksScreen } from "./features/tasks/TasksScreen";
import { TaskDetailScreen } from "./features/tasks/TaskDetailScreen";
import { ScheduleTaskSheet } from "./features/tasks/ScheduleTaskSheet";
import { SourcesSelectScreen } from "./features/sources/SourcesSelectScreen";
import { MoveSheet } from "./features/filing/MoveSheet";
import { ClusterReviewScreen } from "./features/filing/ClusterReviewScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { TrashScreen } from "./features/trash/TrashScreen";
import { OnboardingStack } from "./features/onboarding/OnboardingStack";
import { useQuery } from "./lib/useRpc";
import type { RootStackParamList } from "./navigation";
import { authClient } from "./state/auth";
import { colors } from "./theme/tokens";
import { BootScreen } from "./ui/BootScreen";
import { ErrorState } from "./ui/ErrorState";
import { Screen } from "./ui/Screen";
import { formSheetOptions } from "./ui/Sheet";
import { UiGallery } from "./ui/UiGallery";

const Stack = createNativeStackNavigator<RootStackParamList>();
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.sheet,
    text: colors.fg,
    border: colors.line,
    primary: colors.accent,
    notification: colors.red,
  },
};
const paths = {
  Home: "",
  Ask: "ask",
  Notebook: "notebook/:folderId",
  Note: "note/:fileId",
  Chat: "chat/:threadId",
  Output: "chat/:threadId/output/:output",
  Citation: "source/:sourceId",
  Tasks: "tasks",
  TaskDetail: "tasks/:taskId",
  ScheduleTask: "schedule",
  NewNotebook: "new-notebook",
  SourcesSelect: "select-sources",
  Move: "move",
  ClusterReview: "clusters",
  Settings: "settings",
  Trash: "trash",
  Onboarding: "onboarding",
  ...(__DEV__ ? { UiGallery: "ui-gallery" } : {}),
};
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "avenire://"],
  // A deep-linked detail or sheet still needs a screen underneath for back/dismiss.
  config: { initialRouteName: "Home", screens: paths },
};
const onboardingLinking: LinkingOptions<RootStackParamList> = {
  prefixes: linking.prefixes,
  config: { screens: { Onboarding: "onboarding" } },
};
function LoadingSession() {
  return <BootScreen />;
}
function AppNavigator({
  onboarding = false,
  gallery = false,
}: {
  onboarding?: boolean;
  gallery?: boolean;
}) {
  return (
    <NavigationContainer theme={theme} linking={onboarding ? onboardingLinking : linking}>
      <Stack.Navigator
        initialRouteName={gallery ? "UiGallery" : onboarding ? "Onboarding" : "Home"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // iOS: the system push, so the interactive edge swipe tracks the finger exactly.
          // Edge-only (not full-screen, the iOS 26 default) keeps horizontal content gestures
          // (PDF and image pan, shelves, chip rows) from turning into a back swipe.
          // Android keeps the system back button/gesture, which pops the stack as usual.
          animation: Platform.OS === "ios" ? "default" : "slide_from_right",
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
        }}
      >
        {onboarding ? (
          <Stack.Screen name="Onboarding" component={OnboardingStack} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Ask" component={AskScreen} />
            <Stack.Screen name="Notebook" component={NotebookScreen} />
            <Stack.Screen name="Note" component={NoteScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
            <Stack.Screen name="SourcesSelect" component={SourcesSelectScreen} />
            <Stack.Screen name="ClusterReview" component={ClusterReviewScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Trash" component={TrashScreen} />
            <Stack.Screen
              name="NewNotebook"
              component={NewNotebookSheet}
              options={formSheetOptions()}
            />
            <Stack.Screen
              name="Output"
              component={OutputSheet}
              options={formSheetOptions("full")}
            />
            <Stack.Screen
              name="Citation"
              component={CitationSheet}
              options={formSheetOptions("half", { scrollExpands: false })}
            />
            <Stack.Screen
              name="ScheduleTask"
              component={ScheduleTaskSheet}
              options={formSheetOptions()}
            />
            <Stack.Screen name="Move" component={MoveSheet} options={formSheetOptions()} />
            {__DEV__ ? <Stack.Screen name="UiGallery" component={UiGallery} /> : null}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
function SignedInStack() {
  // The web guard reads user.onboarding_completed_at; settings.get exposes that same field.
  const { data, loading, error, refetch } = useQuery(
    (client) => client["settings.get"](),
    "settings",
  );
  if (loading && !data) return <LoadingSession />;
  if (!data)
    return (
      <Screen>
        <View style={{ padding: 20 }}>
          <ErrorState
            message={error instanceof Error ? error.message : "Could not load your account."}
            onRetry={() => void refetch()}
          />
        </View>
      </Screen>
    );
  return (
    <AppNavigator
      key={data.onboardingCompletedAt === null ? "onboarding" : "app"}
      onboarding={data.onboardingCompletedAt === null}
    />
  );
}
/** Only this explicit development URL bypasses sign-in, solely for primitive review. */
export function RootStack() {
  const { data: session, isPending } = authClient.useSession();
  const gallery =
    __DEV__ &&
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.pathname === "/ui-gallery";
  if (gallery) return <AppNavigator gallery />;
  if (isPending) return <LoadingSession />;
  return session?.user ? <SignedInStack /> : <SignInScreen />;
}
