import { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, TextInput, View } from "react-native";
import { BlurView } from "expo-blur";
import { Icon, IconButton, Pressable, Text } from "../../ui";

/** Focusable home composer; the shared Composer currently has no autoFocus/input-ref API. */
export function AskComposer({
  value,
  onChangeText,
  onAsk,
  onSearch,
  onScope,
  onContext,
  scopeLabel,
  contextCount,
  searching,
  busy,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAsk: () => void;
  onSearch: () => void;
  onScope: () => void;
  onContext: () => void;
  scopeLabel: string;
  contextCount: number;
  searching: boolean;
  busy: boolean;
  autoFocus: boolean;
}) {
  const [focused, setFocused] = useState(searching);
  const input = useRef<TextInput>(null);
  const expanded = searching || focused || Boolean(value);
  const empty = !value.trim();
  return (
    <View style={[styles.surface, expanded ? styles.expanded : styles.capsule]}>
      {Platform.OS !== "web" ? (
        <BlurView
          pointerEvents="none"
          tint="dark"
          intensity={16}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={expanded ? styles.editorExpanded : styles.editorRest}>
        {!expanded ? (
          <IconButton
            icon="plus"
            accessibilityLabel="Choose sources or notes to include"
            size={44}
            onPress={onContext}
            disabled={busy}
          />
        ) : null}
        <TextInput
          ref={input}
          autoFocus={autoFocus}
          accessibilityLabel={
            searching ? "Search your files or ask Ava" : "Ask Ava a follow-up"
          }
          placeholder={
            searching ? "Search or ask Ava" : "Ask Ava, @ a source or note"
          }
          placeholderTextColor="#6E6E6E"
          value={value}
          onChangeText={onChangeText}
          editable={!busy}
          multiline={expanded}
          keyboardAppearance="dark"
          selectionColor="#ABC4FF"
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={() => {
            if (!empty && !busy) onAsk();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: expanded ? 24 : 44,
            maxHeight: 132,
            paddingVertical: 0,
            paddingHorizontal: 0,
            color: "#EDEDED",
            fontSize: expanded ? 16 : 15,
            lineHeight: expanded ? 22 : 20,
            fontFamily: "Geist",
            ...(Platform.OS === "web"
              ? { outlineWidth: 0 }
              : {}),
          }}
        />
        {!expanded ? (
          <>
            <IconButton
              icon="mic"
              accessibilityLabel="Voice input information"
              size={38}
              hitSlop={3}
              onPress={() =>
                Alert.alert(
                  "Voice input",
                  "Use your keyboard's dictation microphone to speak to Ava.",
                )
              }
            />
            <IconButton
              icon="up"
              accessibilityLabel="Send follow-up to Ava"
              size={34}
              hitSlop={5}
              color="#0B1020"
              disabled={empty || busy}
              onPress={onAsk}
              style={{ backgroundColor: "#ABC4FF" }}
            />
          </>
        ) : null}
      </View>
      {expanded ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <IconButton
            icon="plus"
            accessibilityLabel={`Choose context${contextCount ? `, ${contextCount} selected` : ""}`}
            size={36}
            hitSlop={4}
            onPress={onContext}
            disabled={busy}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Search scope: ${scopeLabel}. Choose notebook`}
            hitSlop={{ top: 7, bottom: 7 }}
            disabled={busy}
            onPress={onScope}
            style={{
              height: 30,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: "#2E2E2E",
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              paddingHorizontal: 10,
              maxWidth: searching ? 138 : 190,
              flexShrink: 1,
            }}
          >
            <Icon name="folder" size={13} />
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, fontSize: 13, lineHeight: 16 }}
            >
              {scopeLabel}
            </Text>
            <Icon name="chevD" size={10} color="#6E6E6E" />
          </Pressable>
          <View style={{ flex: 1 }} />
          {searching ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search your files"
              disabled={empty || busy}
              hitSlop={{ top: 5, bottom: 5 }}
              onPress={onSearch}
              style={{
                height: 34,
                borderRadius: 17,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "500" }}>
                Search
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              searching
                ? "Ask Ava about this question"
                : "Send follow-up to Ava"
            }
            disabled={empty || busy}
            hitSlop={{ top: 5, bottom: 5 }}
            onPress={onAsk}
            style={{
              height: 34,
              minWidth: 34,
              borderRadius: 17,
              backgroundColor: "#ABC4FF",
              paddingHorizontal: searching ? 14 : 9,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {searching ? (
              <Text
                style={{
                  color: "#0B1020",
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: "600",
                }}
              >
                Ask Ava
              </Text>
            ) : (
              <Icon name="up" color="#0B1020" />
            )}
          </Pressable>
        </View>
      ) : null}
      {expanded && contextCount ? (
        <Text variant="meta" style={{ paddingHorizontal: 8 }}>
          {contextCount} {contextCount === 1 ? "file" : "files"} included
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  surface: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#FFFFFF14",
    backgroundColor: "#141414EB",
  },
  expanded: {
    borderRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 10,
  },
  capsule: {
    height: 52,
    borderRadius: 26,
    borderColor: "#FFFFFF12",
    backgroundColor: "#141414E0",
  },
  editorExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 8,
  },
  editorRest: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 9,
    gap: 2,
  },
});
