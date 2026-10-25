import { createContext, useContext, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import type { OnboardingPreferences, UserSettings } from "@avenire/contracts";
import { Image } from "expo-image";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "../../theme/tokens";
import {
  Button,
  ErrorState,
  Icon,
  Input,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Text,
  errorMessage,
  type IconName,
} from "../../ui";
import {
  useComputerSetup,
  useNotificationExamples,
  useNotificationPermission,
  useOnboardingData,
  type MaterialSource,
} from "./data";
import { TimeWheel, formatReportTime } from "./TimeWheel";
import { Wordmark } from "./Wordmark";
import { useMotionPreference } from "./useMotionPreference";

type Steps = {
  Welcome: undefined;
  About: undefined;
  Morning: undefined;
  Notifications: undefined;
  Capture: undefined;
  Ready: undefined;
};
type StepProps<T extends keyof Steps> = NativeStackScreenProps<Steps, T>;
const Stack = createNativeStackNavigator<Steps>();

const subjects = ["Physics", "Engineering", "Medicine", "Economics", "Law", "Computer science"];
const materials: readonly { id: MaterialSource; label: string; icon: IconName }[] = [
  { id: "lms", label: "LMS", icon: "lines" },
  { id: "pdf", label: "PDFs", icon: "doc" },
  { id: "youtube", label: "YouTube", icon: "video" },
  { id: "notes", label: "Notes apps", icon: "note" },
  { id: "other", label: "Other", icon: "plus" },
];

function useAnswers(
  initial: UserSettings,
  complete: (answers: OnboardingPreferences) => Promise<void>,
) {
  const [study, setStudy] = useState(initial.studyDescription ?? "");
  const [sources, setSources] = useState<MaterialSource[]>([...(initial.materialSources ?? [])]);
  const [hour, minute] = initial.resultsReadyBy.split(":").map(Number);
  // The Paper wheel has half-hour increments. Settings may contain an arbitrary minute.
  const [minutes, setMinutes] = useState(
    (Math.round(((hour ?? 7) * 60 + (minute ?? 0)) / 30) * 30) % 1440,
  );
  const [morningReport, setMorningReport] = useState(false);
  const toggleSource = (id: MaterialSource) =>
    setSources((current) =>
      current.includes(id) ? current.filter((source) => source !== id) : [...current, id],
    );
  const finish = () =>
    complete({
      studyDescription: study.trim(),
      materialSources: [...sources],
      resultsReadyBy: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      notifications: { morningReport },
    });
  return {
    study,
    setStudy,
    sources,
    toggleSource,
    minutes,
    setMinutes,
    morningReport,
    setMorningReport,
    finish,
  };
}

type OnboardingContextValue = ReturnType<typeof useAnswers> & {
  busy: boolean;
  error: string | undefined;
};
const OnboardingContext = createContext<OnboardingContextValue | null>(null);
function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error("Onboarding provider is missing");
  return value;
}

/** Screen-level dimensions from M32–M37; shared primitives retain their normal sizes. */
function Primary({
  children = "Continue",
  onPress,
  busy = false,
  disabled = false,
  white = false,
}: {
  children?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  white?: boolean;
}) {
  return (
    <Button
      accessibilityLabel={children}
      onPress={onPress}
      busy={busy}
      disabled={disabled}
      style={[styles.primary, white && { backgroundColor: "#FFFFFF" }]}
    >
      <Text style={styles.primaryText}>{children}</Text>
    </Button>
  );
}

function Footer({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(16, 50 - insets.bottom) }]}>
      {children}
    </View>
  );
}

function Heading({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

function Step({ children, footer }: PropsWithChildren<{ footer: ReactNode }>) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollFade top={scrolled}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.stepContent}
            onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
            scrollEventThrottle={100}
          >
            {children}
          </ScrollView>
        </ScrollFade>
        <Footer>{footer}</Footer>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function BrandedStep({
  children,
  footer,
  dimmed = false,
}: PropsWithChildren<{ footer: ReactNode; dimmed?: boolean }>) {
  return (
    <View style={[styles.flex, { backgroundColor: "#06111F" }]}>
      <Image
        source={
          dimmed
            ? require("../../../assets/onboarding/mesh-dim.jpg")
            : require("../../../assets/onboarding/mesh-welcome.jpg")
        }
        contentFit="cover"
        contentPosition={{ left: "30%", top: "50%" }}
        pointerEvents="none"
        accessible={false}
        style={StyleSheet.absoluteFill}
      />
      <Screen style={{ backgroundColor: "transparent" }}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.brandContent, dimmed && { gap: 10, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        <Footer>{footer}</Footer>
      </Screen>
    </View>
  );
}

function WelcomeScreen({ navigation }: StepProps<"Welcome">) {
  return (
    <BrandedStep footer={<Primary white onPress={() => navigation.navigate("About")} />}>
      <Wordmark animate />
      <Text style={styles.welcomeCopy}>Your study material, worked on while you're away.</Text>
    </BrandedStep>
  );
}

function YouTubeMark() {
  return (
    <Svg width={15} height={12} viewBox="0 0 24 18" accessible={false}>
      <Rect width={24} height={18} rx={5} fill="#FF0033" />
      <Path d="M10 5.5v7l6-3.5z" fill="#FFFFFF" />
    </Svg>
  );
}

function AboutScreen({ navigation }: StepProps<"About">) {
  const answers = useOnboarding();
  return (
    <Step
      footer={
        <Primary disabled={!answers.study.trim()} onPress={() => navigation.navigate("Morning")} />
      }
    >
      <Heading title="About you" />
      <View style={styles.studySection}>
        <Text variant="section">What are you studying?</Text>
        <Input
          accessibilityLabel="What are you studying?"
          placeholder="e.g. Physics, second year"
          value={answers.study}
          onChangeText={answers.setStudy}
          maxLength={200}
          autoCorrect={false}
          returnKeyType="done"
          style={styles.studyInput}
        />
        <View accessibilityLabel="Suggested subjects" style={styles.choices}>
          {subjects.map((subject) => {
            const active = answers.study.toLowerCase().startsWith(subject.toLowerCase());
            return (
              <Pressable
                key={subject}
                accessibilityRole="button"
                accessibilityLabel={subject}
                accessibilityState={{ selected: active }}
                hitSlop={6}
                onPress={() => answers.setStudy(subject)}
                style={[styles.subject, active && styles.subjectActive]}
              >
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 16,
                    fontWeight: active ? "500" : "400",
                    color: active ? "#0A0A0A" : colors["fg-2"],
                  }}
                >
                  {subject}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.materialSection}>
        <Text variant="section">Where does your material live?</Text>
        <View accessibilityLabel="Material sources" style={styles.choices}>
          {materials.map(({ id, label, icon }) => {
            const active = answers.sources.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: active }}
                hitSlop={2}
                onPress={() => answers.toggleSource(id)}
                style={[styles.material, active && styles.materialActive]}
              >
                {id === "youtube" ? (
                  <YouTubeMark />
                ) : (
                  <Icon
                    name={icon}
                    size={15}
                    color={active ? colors.fg : colors["fg-2"]}
                    strokeWidth={1.4}
                  />
                )}
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 18,
                    color: active ? colors.fg : colors["fg-2"],
                    fontWeight: active ? "500" : "400",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Step>
  );
}

function MorningScreen({ navigation }: StepProps<"Morning">) {
  const answers = useOnboarding();
  return (
    <Step
      footer={
        <Primary
          onPress={() => navigation.navigate(Platform.OS === "web" ? "Capture" : "Notifications")}
        />
      }
    >
      <Heading
        title="Your morning"
        description="Ruth will have your notes and questions ready by this time."
      />
      <TimeWheel value={answers.minutes} onChange={answers.setMinutes} />
    </Step>
  );
}

function NotificationsScreen({ navigation }: StepProps<"Notifications">) {
  const answers = useOnboarding();
  const permission = useNotificationPermission();
  const examples = useNotificationExamples();
  const allow = async () => {
    const granted = await permission.request();
    if (granted === undefined) return;
    answers.setMorningReport(granted);
    if (navigation.isFocused()) navigation.navigate("Capture");
  };
  return (
    <Step
      footer={
        <>
          {permission.error ? <ErrorState message={permission.error} /> : null}
          <Primary busy={permission.busy} onPress={() => void allow()}>
            Turn on notifications
          </Primary>
          <Button
            accessibilityLabel="Not now"
            hitSlop={12}
            variant="ghost"
            disabled={permission.busy}
            style={styles.secondary}
            onPress={() => {
              answers.setMorningReport(false);
              navigation.navigate("Capture");
            }}
          >
            <Text style={styles.secondaryText}>Not now</Text>
          </Button>
        </>
      }
    >
      <Heading
        title="Hear from Ruth"
        description="A note when the overnight run is done, and when she needs you. Nothing else."
      />
      <View style={styles.notificationExamples}>
        {examples.data.map((example, index) => (
          <View
            key={example.id}
            accessible
            accessibilityLabel={`Example notification. ${example.title} ${example.body} ${example.id === "morning" ? formatReportTime(answers.minutes) : example.time}`}
            style={[styles.notification, index > 0 && { opacity: 0.6 }]}
          >
            <View style={styles.notificationIcon}>
              <Icon name="moon" size={18} color="#E4EAFF" strokeWidth={1.4} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.notificationMeta}>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: "500" }}>Avenire</Text>
                <Text variant="meta">
                  {example.id === "morning" ? formatReportTime(answers.minutes) : example.time}
                </Text>
              </View>
              <Text variant="section">{example.title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 19 }}>{example.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </Step>
  );
}

function CaptureScreen({ navigation }: StepProps<"Capture">) {
  const computer = useComputerSetup();
  const connection =
    computer.data.connection === "connected"
      ? "Computer connected"
      : computer.data.connection === "disconnected"
        ? "No computer signed in yet"
        : "Computer connection unavailable";
  return (
    <Step
      footer={
        <>
          <Primary onPress={() => navigation.navigate("Ready")} />
          <Button
            accessibilityLabel="Email me the computer app"
            accessibilityHint="Computer app emails are not available yet"
            hitSlop={12}
            variant="ghost"
            disabled={!computer.data.canEmailApp}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Email me the computer app</Text>
          </Button>
        </>
      }
    >
      <Heading
        title="Capture on your computer"
        description="Press ⌥C in Avenire for Mac or Windows to save the PDF, lecture or page you have open. It shows up here a moment later."
      />
      <View style={styles.capture}>
        <View accessible accessibilityLabel="Option C" style={{ flexDirection: "row", gap: 8 }}>
          {["⌥", "C"].map((key) => (
            <View key={key} style={styles.keycap}>
              <Text variant="mono" color="fg" style={{ fontSize: 22, lineHeight: 28 }}>
                {key}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.connection}>
          <Icon name="laptop" size={16} strokeWidth={1.4} />
          <Text style={{ fontSize: 14, lineHeight: 18 }}>{connection}</Text>
        </View>
      </View>
    </Step>
  );
}

function ReadyScreen() {
  const answers = useOnboarding();
  return (
    <BrandedStep
      dimmed
      footer={
        <>
          {answers.error ? <ErrorState message={answers.error} /> : null}
          <Primary white busy={answers.busy} onPress={() => void answers.finish()}>
            Open Avenire
          </Primary>
        </>
      }
    >
      <Text accessibilityRole="header" style={styles.readyTitle}>
        You're set.
      </Text>
      <Text style={styles.readyCopy}>
        Ruth starts tonight. Your first morning report will be here at{" "}
        {formatReportTime(answers.minutes)}.
      </Text>
    </BrandedStep>
  );
}

function OnboardingNavigator({
  settings,
  complete,
  busy,
  error,
}: {
  settings: UserSettings;
  complete: (answers: OnboardingPreferences) => Promise<void>;
  busy: boolean;
  error: string | undefined;
}) {
  const answers = useAnswers(settings, complete);
  const reducedMotion = useMotionPreference();
  return (
    <OnboardingContext.Provider value={{ ...answers, busy, error }}>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: reducedMotion ? "fade" : "slide_from_right",
          animationDuration: reducedMotion ? 150 : 250,
          animationMatchesGesture: true,
          gestureEnabled: !busy,
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ title: "Welcome to Avenire" }}
        />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: "About you" }} />
        <Stack.Screen
          name="Morning"
          component={MorningScreen}
          options={{ title: "Your morning" }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: "Hear from Ruth" }}
        />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ title: "Capture on your computer" }}
        />
        <Stack.Screen name="Ready" component={ReadyScreen} options={{ title: "You’re set" }} />
      </Stack.Navigator>
    </OnboardingContext.Provider>
  );
}

export function OnboardingStack() {
  const query = useOnboardingData();
  if (!query.data) {
    return (
      <Screen>
        {query.loading ? (
          <View accessibilityLabel="Loading your setup" style={{ paddingTop: 56 }}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <View style={{ padding: 24, gap: 16 }}>
            <ErrorState message={errorMessage(query.error)} />
            <Button
              accessibilityLabel="Retry loading your setup"
              onPress={() => void query.refetch()}
              style={{ height: 44 }}
            >
              Try again
            </Button>
          </View>
        )}
      </Screen>
    );
  }
  return (
    <OnboardingNavigator
      settings={query.data.settings}
      complete={query.complete}
      busy={query.busy}
      error={query.saveError}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepContent: { flexGrow: 1, paddingBottom: 24 },
  heading: { paddingTop: 56, paddingHorizontal: 24, gap: 8 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "600", letterSpacing: -0.6, color: colors.fg },
  description: { fontSize: 15, lineHeight: 22, color: colors["fg-2"] },
  footer: { paddingHorizontal: 24, gap: 14 },
  primary: { height: 44, borderRadius: 10, paddingHorizontal: 16 },
  primaryText: { fontSize: 15, lineHeight: 18, fontWeight: "500", color: "#0A0A0A" },
  secondary: { height: 20, minWidth: 44, alignSelf: "center" },
  secondaryText: { fontSize: 15, lineHeight: 20, color: colors["fg-2"] },
  brandContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  welcomeCopy: { fontSize: 17, lineHeight: 24, color: "#F2F2F2", textAlign: "center" },
  studySection: { paddingHorizontal: 24, paddingTop: 32, gap: 10 },
  studyInput: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 20,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subject: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors["line-2"],
    justifyContent: "center",
  },
  subjectActive: { backgroundColor: colors.fg, borderColor: colors.fg, borderWidth: 0 },
  materialSection: { paddingHorizontal: 24, paddingTop: 30, gap: 10 },
  material: {
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors["line-2"],
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  materialActive: { backgroundColor: colors["surface-4"], borderColor: "#4A4A4A" },
  notificationExamples: { paddingTop: 40, paddingHorizontal: 24, gap: 10 },
  notification: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(40,40,44,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  notificationIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#151443",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationMeta: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  capture: { alignItems: "center", paddingHorizontal: 24, paddingTop: 52, gap: 18 },
  keycap: {
    height: 56,
    minWidth: 56,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors["surface-3"],
    borderColor: "#3A3A3A",
    borderWidth: 1,
    borderBottomWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  connection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors["surface-1"],
  },
  readyTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "600",
    letterSpacing: -0.68,
    color: colors.fg,
    textAlign: "center",
  },
  readyCopy: { fontSize: 16, lineHeight: 23, color: colors["fg-2"], textAlign: "center" },
});
