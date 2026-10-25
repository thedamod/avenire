import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";
import type { Folder, TrashEntry } from "@avenire/contracts";
import type { ScreenProps } from "../../navigation";
import { colors, motion } from "../../theme/tokens";
import {
  EmptyState,
  ErrorState,
  FileIcon,
  GlassButton,
  GlassHeader,
  Icon,
  Pressable,
  Screen,
  ScrollFade,
  SelectionDock,
  SkeletonRow,
  Text,
  errorMessage,
} from "../../ui";
import { FeatureOverlay, FeatureSheetHeader as SheetHeader } from "../tasks/FeatureOverlay";
import { notebookColor } from "../tasks/notebookColor";
import { entryKey, entryTitle, useTrash } from "./data";

function TrashRow({
  entry,
  notebook,
  selected,
  selecting,
  busy,
  now,
  onToggle,
  onActions,
  onRestore,
  onPurge,
}: {
  entry: TrashEntry;
  notebook: Folder | undefined;
  selected: boolean;
  selecting: boolean;
  busy: boolean;
  now: number;
  onToggle: () => void;
  onActions: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const longPressed = useRef(false);
  const days = Math.max(0, Math.ceil((Date.parse(entry.purgeAt) - now) / 86_400_000));
  const left = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days left`;
  return (
    <Animated.View exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entryTitle(entry)}, ${left}`}
        accessibilityState={{ selected }}
        accessibilityHint={
          selecting
            ? "Tap to toggle selection"
            : "Long press to select. Tap for restore and delete actions."
        }
        accessibilityActions={[
          { name: "select", label: selected ? "Deselect" : "Select" },
          { name: "restore", label: "Restore" },
          { name: "purge", label: "Delete forever" },
        ]}
        onAccessibilityAction={(event) => {
          const action = event.nativeEvent.actionName;
          if (action === "select") onToggle();
          else if (action === "restore") onRestore();
          else if (action === "purge") onPurge();
        }}
        disabled={busy}
        onPressIn={() => {
          longPressed.current = false;
        }}
        onLongPress={() => {
          longPressed.current = true;
          onToggle();
        }}
        onPress={() => {
          if (!longPressed.current) {
            if (selecting) onToggle();
            else onActions();
          }
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 20,
          backgroundColor: selected ? colors["surface-2"] : "transparent",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: selected ? colors.fg : "#4A4A4A",
            backgroundColor: selected ? colors.fg : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? <Icon name="check" size={12} color="#0B0B0B" strokeWidth={2} /> : null}
        </View>
        <View style={{ width: 16 }}>
          {entry._tag === "folder" ? (
            <Icon name="folder" />
          ) : (
            <FileIcon
              type={
                entry.file.kind === "web-page"
                  ? "web"
                  : entry.file.kind === "selection"
                    ? "note"
                    : entry.file.kind
              }
              {...(entry.file.sourceUrl ? { url: entry.file.sourceUrl } : {})}
            />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            color="fg"
            numberOfLines={1}
            style={{ fontSize: 15, lineHeight: 20, fontWeight: "500" }}
          >
            {entryTitle(entry)}
          </Text>
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            {notebook ? (
              <View
                style={{
                  width: 6,
                  height: 8,
                  borderRadius: 1,
                  backgroundColor: notebookColor(notebook.color),
                }}
              />
            ) : null}
            <Text variant="meta" numberOfLines={1} style={{ flex: 1 }}>
              {entry._tag === "folder"
                ? `Notebook · ${entry.folder.noteCount} notes, ${entry.folder.sourceCount} sources`
                : (notebook?.name ?? "Unfiled")}
            </Text>
          </View>
        </View>
        <Text variant="meta" style={{ color: days <= 1 ? colors.red : colors["fg-3"] }}>
          {left}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function TrashScreen({ navigation }: ScreenProps<"Trash">) {
  const trash = useTrash();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [actionEntry, setActionEntry] = useState<TrashEntry>();
  const [scrolled, setScrolled] = useState(false);
  const [now, setNow] = useState(Date.now);
  const entries = trash.data ?? [];
  const selectedEntries = entries.filter((entry) => selected.has(entryKey(entry)));
  const count = selectedEntries.length;
  const selecting = count > 0;
  const refresh = useCallback(() => {
    void trash.refetch();
    void trash.folders.refetch();
    setNow(Date.now());
  }, [trash.refetch, trash.folders.refetch]);
  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(timer);
    }, [refresh]),
  );
  useEffect(() => {
    if (!trash.data) return;
    const current = new Set(trash.data.map(entryKey));
    setSelected((previous) =>
      [...previous].some((key) => !current.has(key))
        ? new Set([...previous].filter((key) => current.has(key)))
        : previous,
    );
  }, [trash.data]);
  function toggle(entry: TrashEntry) {
    setSelected((previous) => {
      const next = new Set(previous);
      const key = entryKey(entry);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function confirmPurge(targets: readonly TrashEntry[], empty = false) {
    if (trash.busy || !targets.length) return;
    setActionEntry(undefined);
    Alert.alert(
      empty
        ? "Empty Trash?"
        : targets.length === 1
          ? `Delete “${entryTitle(targets[0]!)}” forever?`
          : `Delete ${targets.length} items forever?`,
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: empty ? "Empty trash" : "Delete forever",
          style: "destructive",
          onPress: () => void trash.mutate(empty ? "empty" : "purge", targets),
        },
      ],
    );
  }
  return (
    <Screen edges={["top", "left", "right"]}>
      {selecting ? (
        <View
          style={{
            height: 52,
            paddingHorizontal: 20,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
            disabled={trash.busy}
            onPress={() => setSelected(new Set())}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text color="fg" style={{ fontSize: 16, lineHeight: 20 }}>
              Cancel
            </Text>
          </Pressable>
          <Text color="fg" weight="600" style={{ fontSize: 16, lineHeight: 20 }}>
            {count} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select all trashed items"
            disabled={trash.busy}
            onPress={() => setSelected(new Set(entries.map(entryKey)))}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text color="fg" style={{ fontSize: 16, lineHeight: 20 }}>
              Select all
            </Text>
          </Pressable>
        </View>
      ) : (
        <GlassHeader
          title="Trash"
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
      )}
      <View style={{ gap: 4, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 }}>
        <Text
          color="fg"
          style={{ fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.56 }}
        >
          Trash
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20 }}>
          Items are deleted for good after 30 days.
        </Text>
      </View>
      <ScrollFade top={scrolled}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 30) + 110 }}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 2)}
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={trash.loading && Boolean(trash.data)}
              onRefresh={refresh}
              tintColor={colors["fg-2"]}
            />
          }
        >
          {trash.loading && !trash.data ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : trash.error && !trash.data ? (
            <View style={{ padding: 20 }}>
              <ErrorState
                message={errorMessage(trash.error)}
                onRetry={() => void trash.refetch()}
              />
            </View>
          ) : !entries.length ? (
            <EmptyState
              icon="trash"
              title="Trash is empty"
              description="Files and notebooks you delete wait here for 30 days before they're gone for good."
            />
          ) : (
            <>
              {entries.map((entry) => (
                <TrashRow
                  key={entryKey(entry)}
                  entry={entry}
                  notebook={
                    entry._tag === "file"
                      ? entry.file.folderIds
                          .map((id) => trash.folders.data?.find((folder) => folder.id === id))
                          .find((folder) => folder !== undefined)
                      : undefined
                  }
                  selected={selected.has(entryKey(entry))}
                  selecting={selecting}
                  busy={trash.busy}
                  now={now}
                  onToggle={() => toggle(entry)}
                  onActions={() => setActionEntry(entry)}
                  onRestore={() => void trash.mutate("restore", [entry])}
                  onPurge={() => confirmPurge([entry])}
                />
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Empty trash permanently"
                disabled={trash.busy}
                onPress={() => confirmPurge(entries, true)}
                style={{
                  minHeight: 44,
                  marginVertical: 18,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Text color="red" style={{ fontSize: 15, lineHeight: 20 }}>
                  Empty trash
                </Text>
              </Pressable>
            </>
          )}
          {trash.mutationError ? (
            <View style={{ padding: 20 }}>
              <ErrorState message={trash.mutationError} />
            </View>
          ) : null}
          {trash.notice ? (
            <Text variant="meta" accessibilityLiveRegion="polite" style={{ paddingHorizontal: 20 }}>
              {trash.notice}
            </Text>
          ) : null}
        </ScrollView>
      </ScrollFade>
      {selecting ? (
        <Animated.View
          entering={FadeInDown.duration(200)
            .easing(Easing.bezier(...motion.easing.out))
            .reduceMotion(ReduceMotion.System)}
          exiting={FadeOutDown.duration(150).reduceMotion(ReduceMotion.System)}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: Math.max(insets.bottom, 30) + 90,
          }}
        >
          <SelectionDock
            count={count}
            actions={[
              {
                icon: "restore",
                accessibilityLabel: `Restore ${count} selected items`,
                disabled: trash.busy,
                onPress: () => void trash.mutate("restore", selectedEntries),
              },
              {
                icon: "trash",
                accessibilityLabel: `Delete ${count} selected items forever`,
                color: colors.red,
                disabled: trash.busy,
                onPress: () => confirmPurge(selectedEntries),
              },
              {
                icon: "close",
                accessibilityLabel: "Clear selection",
                disabled: trash.busy,
                onPress: () => setSelected(new Set()),
              },
            ]}
          />
        </Animated.View>
      ) : null}
      <FeatureOverlay visible={Boolean(actionEntry)} onClose={() => setActionEntry(undefined)}>
        <SheetHeader
          title={actionEntry ? entryTitle(actionEntry) : "Trash actions"}
          onClose={() => setActionEntry(undefined)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore item"
          disabled={trash.busy}
          onPress={() => {
            if (actionEntry) void trash.mutate("restore", [actionEntry]);
            setActionEntry(undefined);
          }}
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon name="restore" />
          <Text color="fg" style={{ fontSize: 15 }}>
            Restore
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete item forever"
          disabled={trash.busy}
          onPress={() => {
            if (actionEntry) confirmPurge([actionEntry]);
          }}
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon name="trash" color={colors.red} />
          <Text color="red" style={{ fontSize: 15 }}>
            Delete forever
          </Text>
        </Pressable>
      </FeatureOverlay>
    </Screen>
  );
}
