import { useCallback, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { ScreenProps } from "../../navigation";
import { colors } from "../../theme/tokens";
import {
  Button,
  ErrorState,
  GlassButton,
  GlassHeader,
  Icon,
  Input,
  Pressable,
  Screen,
  ScrollFade,
  SkeletonRow,
  Switch,
  Text,
  errorMessage,
} from "../../ui";
import {
  ChoiceSheet,
  FeatureOverlay,
  FeatureSheetHeader as SheetHeader,
} from "../tasks/FeatureOverlay";
import { READY_TIMES, formatClock } from "../tasks/schedule";
import { useDesktopSettings, useNotificationPermission, useSettingsData } from "./data";

function Group({ title, foot, children }: PropsWithChildren<{ title?: string; foot?: ReactNode }>) {
  return (
    <View style={{ gap: 7, paddingTop: 22, paddingHorizontal: 16 }}>
      {title ? (
        <Text
          variant="meta"
          style={{ paddingHorizontal: 4, fontWeight: "500", letterSpacing: 0.48 }}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={{ backgroundColor: "#141414", borderRadius: 10, overflow: "hidden" }}>
        {children}
      </View>
      {foot ? (
        <Text variant="meta" style={{ paddingHorizontal: 4 }}>
          {foot}
        </Text>
      ) : null}
    </View>
  );
}
function Row({
  title,
  subtitle,
  value,
  onPress,
  leading,
  trailing,
  first = false,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  value?: string | undefined;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  first?: boolean;
  disabled?: boolean;
}) {
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text color="fg" style={{ fontSize: 16, lineHeight: 21 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" style={{ fontSize: 13, lineHeight: 17 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={{ fontSize: 15, lineHeight: 20, textAlign: "right", maxWidth: "47%" }}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress ? <Icon name="chevR" size={13} color={colors["fg-3"]} /> : null}
    </>
  );
  return (
    <View>
      {!first ? <View style={{ height: 1, marginLeft: 16, backgroundColor: colors.line }} /> : null}
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}${value ? `, ${value}` : ""}`}
          disabled={disabled}
          onPress={onPress}
          style={[styles.row, { minHeight: subtitle ? 60 : 48 }]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={[styles.row, { minHeight: subtitle ? 60 : 48 }]}>{content}</View>
      )}
    </View>
  );
}
function Meter({
  label,
  used,
  limit,
  value,
}: {
  label: string;
  used: number;
  limit: number;
  value: string;
}) {
  const percent = Math.max(0, Math.min(100, limit > 0 ? (used / limit) * 100 : 0));
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Text color="fg" style={{ fontSize: 16, lineHeight: 21 }}>
          {label}
        </Text>
        <Text variant="mono" color="fg" style={{ fontSize: 12 }}>
          {value}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent), text: value }}
        style={{ height: 4, borderRadius: 2, backgroundColor: colors["line-2"] }}
      >
        <View
          style={{ width: `${percent}%`, height: 4, borderRadius: 2, backgroundColor: colors.fg }}
        />
      </View>
    </View>
  );
}
function bytes(value: number) {
  return value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1).replace(/\.0$/, "")} GB`
    : `${Math.round(value / 1024 ** 2)} MB`;
}

export function SettingsScreen({ navigation }: ScreenProps<"Settings">) {
  const settings = useSettingsData();
  const notifications = useNotificationPermission();
  const desktop = useDesktopSettings();
  const [scrolled, setScrolled] = useState(false);
  const [choice, setChoice] = useState<"time" | "changes" | "paywall">();
  const [panel, setPanel] = useState<"profile" | "devices" | "plan" | "privacy">();
  const [name, setName] = useState("");
  const [requesting, setRequesting] = useState(false);
  const notificationLock = useRef(false);
  const { data, refetch, trash } = settings;
  useFocusEffect(
    useCallback(() => {
      void refetch();
      void trash.refetch();
    }, [refetch, trash.refetch]),
  );
  const busy = settings.busy || requesting;
  const preferences = data?.settings;
  async function changeNotification(kind: "morningReport" | "needsYou", value: boolean) {
    if (notificationLock.current || busy) return;
    notificationLock.current = true;
    setRequesting(true);
    try {
      if (value && !notifications.granted && !(await notifications.request())) {
        Alert.alert(
          "Notifications are off",
          "Allow Avenire notifications in your phone's Settings to hear from Ava.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => {
                void notifications
                  .openSettings()
                  .catch(() =>
                    Alert.alert(
                      "Couldn't open Settings",
                      "Open your phone's Settings and allow notifications for Avenire.",
                    ),
                  );
              },
            },
          ],
        );
        return;
      }
      await settings.save({
        notifications:
          kind === "needsYou" ? { needsYou: value, runFailed: value } : { morningReport: value },
      });
    } finally {
      notificationLock.current = false;
      setRequesting(false);
    }
  }
  const toggle = (
    label: string,
    value: boolean,
    onValueChange: (value: boolean) => void,
    disabled = busy,
  ) => (
    <View style={{ minHeight: 44, justifyContent: "center" }}>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </View>
  );
  return (
    <Screen>
      <GlassHeader
        title="Settings"
        leading={
          <GlassButton
            icon="back"
            accessibilityLabel="Back"
            hitSlop={2}
            onPress={() => navigation.goBack()}
          />
        }
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />
      <ScrollFade top={scrolled}>
        <ScrollView
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={
            <RefreshControl
              refreshing={settings.loading && Boolean(data)}
              onRefresh={() => {
                void refetch();
                void notifications.refresh();
              }}
              tintColor={colors["fg-2"]}
            />
          }
        >
          {settings.loading && !data ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : !data ? (
            <View style={{ padding: 20 }}>
              <ErrorState message={errorMessage(settings.error)} onRetry={() => void refetch()} />
            </View>
          ) : preferences ? (
            <>
              <Group>
                <Row
                  first
                  title={data.account.name || "Your account"}
                  subtitle={data.account.email}
                  disabled={busy}
                  onPress={() => {
                    setName(data.account.name);
                    setPanel("profile");
                  }}
                  leading={
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: colors["surface-4"],
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text color="fg" weight="600">
                        {data.account.name
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase() || "A"}
                      </Text>
                    </View>
                  }
                />
                <Row
                  title="Sign-in"
                  value={
                    data.account.providers
                      .map(
                        (provider) =>
                          ({ google: "Google", credential: "Email", apple: "Apple" })[provider] ??
                          provider,
                      )
                      .join(", ") || "Email"
                  }
                />
                <Row
                  title="Devices"
                  subtitle={
                    data.account.sessions
                      .map((session) => `${session.device}${session.current ? " (this one)" : ""}`)
                      .join(" · ") || "No device information available"
                  }
                  onPress={() => setPanel("devices")}
                />
              </Group>
              <Group
                title="Plan and usage"
                foot={`Resets ${new Date(data.usage.resetsAt).toLocaleDateString(undefined, { weekday: "long" })}. Chats are unlimited.`}
              >
                <Row
                  first
                  title={data.usage.plan === "pro" ? "Pro" : "Student · free"}
                  value="Compare"
                  onPress={() => setPanel("plan")}
                />
                <Meter
                  label="Overnight runs this week"
                  used={data.usage.overnightRunsThisWeek}
                  limit={data.usage.overnightRunLimit}
                  value={`${data.usage.overnightRunsThisWeek} of ${data.usage.overnightRunLimit}`}
                />
                <Meter
                  label="Storage"
                  used={data.usage.storageBytes}
                  limit={data.usage.storageLimitBytes}
                  value={`${bytes(data.usage.storageBytes)} of ${bytes(data.usage.storageLimitBytes)}`}
                />
              </Group>
              <Group title="Overnight runs">
                <Row
                  first
                  title="Have results ready by"
                  value={formatClock(preferences.resultsReadyBy)}
                  disabled={busy}
                  onPress={() => setChoice("time")}
                />
                <Row
                  title="Ava can change files"
                  value={
                    preferences.fileChanges === "propose"
                      ? "Propose, I accept"
                      : "Apply, I can undo"
                  }
                  disabled={busy}
                  onPress={() => setChoice("changes")}
                />
                <Row
                  title="Sort Unfiled every night"
                  subtitle="Uses no runs"
                  trailing={toggle(
                    "Sort Unfiled every night",
                    preferences.sortUnfiledNightly,
                    (sortUnfiledNightly) => void settings.save({ sortUnfiledNightly }),
                  )}
                />
              </Group>
              <Group
                title="Notifications"
                foot={
                  !notifications.supported
                    ? "Notification permissions are available in the iOS and Android apps."
                    : notifications.permission && !notifications.granted
                      ? "Notifications are off in your phone's Settings."
                      : undefined
                }
              >
                <Row
                  first
                  title="Morning report"
                  subtitle="When the overnight run finishes"
                  trailing={toggle(
                    "Morning report notifications",
                    notifications.granted && preferences.notifications.morningReport,
                    (value) => void changeNotification("morningReport", value),
                    busy || !notifications.supported,
                  )}
                />
                <Row
                  title="When Ava needs you"
                  subtitle="Approvals, questions, failed runs"
                  trailing={toggle(
                    "When Ava needs you notifications",
                    notifications.granted &&
                      preferences.notifications.needsYou &&
                      preferences.notifications.runFailed,
                    (value) => void changeNotification("needsYou", value),
                    busy || !notifications.supported,
                  )}
                />
              </Group>
              <Group
                title="Capture"
                foot="Capture happens in Avenire for Mac and Windows. Everything you capture syncs here."
              >
                <Row
                  first
                  title="Capture pages you're logged into"
                  subtitle="Applies to capture on your computer"
                  trailing={toggle(
                    "Capture pages you're logged into",
                    preferences.captureLoggedInPages,
                    (captureLoggedInPages) => void settings.save({ captureLoggedInPages }),
                  )}
                />
                <Row
                  title="Paywalled pages"
                  value={
                    preferences.paywalledPages === "title-abstract" ? "Title and abstract" : "Skip"
                  }
                  disabled={busy}
                  onPress={() => setChoice("paywall")}
                />
                <Row
                  title="Capture shortcut"
                  subtitle="Managed on the computer"
                  value={desktop.data.shortcut ?? "On computer"}
                />
              </Group>
              <Group
                title="On your computer"
                foot="Folders and the drive are set up on the computer."
              >
                <Row first title="Window permissions" subtitle="Managed on the computer" />
                <Row title="Hotkeys" subtitle="Managed on the computer" />
                <Row
                  title="Connected folders"
                  subtitle="Managed on the computer"
                  value={desktop.data.connectedFolders ?? "On computer"}
                />
                <Row
                  title="Open Avenire in Finder"
                  subtitle="WebDAV drive · managed on the computer"
                />
              </Group>
              <Group>
                <Row
                  first
                  title="Trash"
                  value={trash.data ? String(trash.data.length) : undefined}
                  onPress={() => navigation.navigate("Trash")}
                />
                <Row title="Privacy" onPress={() => setPanel("privacy")} />
              </Group>
              {settings.mutationError || notifications.error ? (
                <View style={{ padding: 20 }}>
                  <ErrorState message={settings.mutationError ?? notifications.error!} />
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out of Avenire"
                disabled={busy}
                onPress={() => void settings.signOut()}
                style={{
                  minHeight: 44,
                  marginTop: 28,
                  marginBottom: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text color="red" style={{ fontSize: 16, lineHeight: 20 }}>
                  Sign out
                </Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </ScrollFade>
      <ChoiceSheet
        title="Have results ready by"
        visible={choice === "time"}
        value={preferences?.resultsReadyBy ?? "07:00"}
        options={[...new Set([...READY_TIMES, preferences?.resultsReadyBy ?? "07:00"])]
          .sort()
          .map((value) => ({ value, label: formatClock(value) }))}
        onChange={(resultsReadyBy) =>
          void settings.save({
            resultsReadyBy,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          })
        }
        onClose={() => setChoice(undefined)}
      />
      <ChoiceSheet
        title="Ava can change files"
        visible={choice === "changes"}
        value={preferences?.fileChanges ?? "propose"}
        options={[
          { value: "propose", label: "Propose, I accept" },
          { value: "apply", label: "Apply, I can undo" },
        ]}
        onChange={(fileChanges) => void settings.save({ fileChanges })}
        onClose={() => setChoice(undefined)}
      />
      <ChoiceSheet
        title="Paywalled pages"
        visible={choice === "paywall"}
        value={preferences?.paywalledPages ?? "title-abstract"}
        options={[
          { value: "title-abstract", label: "Title and abstract" },
          { value: "skip", label: "Skip" },
        ]}
        onChange={(paywalledPages) => void settings.save({ paywalledPages })}
        onClose={() => setChoice(undefined)}
      />
      <FeatureOverlay visible={Boolean(panel)} onClose={() => setPanel(undefined)}>
        <SheetHeader
          title={
            {
              profile: "Your account",
              devices: "Devices",
              plan: "Plan and usage",
              privacy: "Privacy",
            }[panel ?? "profile"]
          }
          onClose={() => setPanel(undefined)}
        />
        <ScrollFade color={colors.sheet} top={false} style={{ flex: 0, flexShrink: 1 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 16 }}
          >
            {panel === "profile" ? (
              <>
                <Input
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  maxLength={100}
                  style={{ height: 44 }}
                />
                <Text>{data?.account.email}</Text>
                <Button
                  accessibilityLabel="Save profile name"
                  hitSlop={6}
                  busy={settings.busy}
                  disabled={!name.trim()}
                  onPress={() =>
                    void settings.saveProfile(name.trim()).then((ok) => {
                      if (ok) setPanel(undefined);
                    })
                  }
                >
                  Save
                </Button>
              </>
            ) : null}
            {panel === "devices" ? (
              <>
                {data?.account.sessions.map((session) => (
                  <View
                    key={session.id}
                    style={{
                      gap: 4,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                    }}
                  >
                    <Text color="fg">
                      {session.device}
                      {session.current ? " (this one)" : ""}
                    </Text>
                    <Text variant="meta">
                      Last active {new Date(session.lastActiveAt).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
                <Button
                  variant="secondary"
                  accessibilityLabel="Sign out of other devices"
                  hitSlop={6}
                  busy={settings.busy}
                  disabled={!data?.account.sessions.some((session) => !session.current)}
                  onPress={() =>
                    Alert.alert("Sign out of other devices?", "This phone stays signed in.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Sign out others", onPress: () => void settings.signOutOthers() },
                    ])
                  }
                >
                  Sign out other devices
                </Button>
              </>
            ) : null}
            {panel === "plan" ? (
              <>
                <Text color="fg">{data?.usage.plan === "pro" ? "Pro" : "Student · free"}</Text>
                <Text>Compare and manage plans in Avenire on your computer.</Text>
              </>
            ) : null}
            {panel === "privacy" ? (
              <>
                <Text color="fg">Your files are private to you.</Text>
                <Text>Ava works on copies in Cloud and proposes changes for you to accept.</Text>
                <Button accessibilityLabel="Export data, coming soon" disabled variant="secondary">
                  Export data · coming soon
                </Button>
              </>
            ) : null}
            {settings.mutationError ? <ErrorState message={settings.mutationError} /> : null}
          </ScrollView>
        </ScrollFade>
      </FeatureOverlay>
    </Screen>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
