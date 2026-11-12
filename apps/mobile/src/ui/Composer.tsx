import { useState, type ReactNode } from "react";
import { GlassBackdrop } from "./GlassBackdrop";
import { LinearGradient } from "expo-linear-gradient";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/tokens";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Pressable } from "./Pressable";
import { Text } from "./Text";
export interface ComposerControl {
  key: string;
  label: string;
  icon?: "moon" | "folder" | "clock";
  swatch?: string;
  onPress?: () => void;
}
export interface ComposerProps {
  placeholder?: string;
  value: string;
  onChangeText: (value: string) => void;
  onSend: (value: string) => void;
  onAdd?: () => void;
  onMic?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  tray?: ReactNode;
  controls?: readonly ComposerControl[];
  expanded?: boolean;
  disabled?: boolean;
  sending?: boolean;
  floating?: boolean;
  keyboardAware?: boolean;
  style?: StyleProp<ViewStyle>;
}
const defaultControls: readonly ComposerControl[] = [
  { key: "ruth", icon: "moon", label: "Ava" },
  { key: "notebook", icon: "folder", label: "All notebooks" },
  { key: "time", icon: "clock", label: "Now" },
];

/** Floating docks need Screen edges without bottom; inline galleries set floating=false. */
export function Composer({
  placeholder = "Ask Ava, @ a source or note",
  value,
  onChangeText,
  onSend,
  onAdd,
  onMic,
  onFocus,
  onBlur,
  leading,
  trailing,
  tray,
  controls,
  expanded,
  disabled = false,
  sending = false,
  floating = true,
  keyboardAware = true,
  style,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const insets = useSafeAreaInsets();
  const isExpanded = expanded ?? focused;
  const send = () => {
    if (value.trim() && !disabled && !sending) onSend(value.trim());
  };
  const input = (
    <TextInput
      key="composer-editor"
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      placeholderTextColor={colors["fg-3"]}
      value={value}
      onChangeText={onChangeText}
      editable={!disabled}
      multiline={isExpanded}
      selectionColor={colors.accent}
      keyboardAppearance="dark"
      returnKeyType="send"
      submitBehavior={isExpanded ? "newline" : "submit"}
      onSubmitEditing={send}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 0,
        height: isExpanded ? undefined : 44,
        minHeight: isExpanded ? 24 : 44,
        maxHeight: 132,
        paddingVertical: 0,
        paddingHorizontal: 0,
        fontSize: isExpanded ? 16 : 15,
        lineHeight: isExpanded ? 22 : 20,
        color: colors.fg,
        fontFamily: "Geist",
        outlineWidth: 0,
      }}
    />
  );
  const sendButton = (
    <IconButton
      icon={sending ? "pause" : "up"}
      accessibilityLabel={sending ? "Sending message" : "Send message"}
      size={34}
      iconSize={16}
      strokeWidth={1.8}
      disabledOpacity={1}
      color={colors["on-accent"]}
      disabled={disabled || sending || !value.trim()}
      onPress={send}
      style={{ backgroundColor: colors.accent }}
    />
  );
  return (
    <KeyboardStickyView
      enabled={floating && keyboardAware && Platform.OS !== "web"}
      offset={{ opened: Math.max(insets.bottom, 30) - 8 }}
      style={[
        floating ? styles.floating : undefined,
        {
          paddingHorizontal: 12,
          paddingTop: floating ? 28 : 0,
          paddingBottom: floating ? Math.max(insets.bottom, 30) : 0,
        },
        style,
      ]}
    >
      {floating ? (
        <LinearGradient
          pointerEvents="none"
          colors={["#0B0B0B00", "#0B0B0BF0", colors.bg]}
          locations={[0, 0.3, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {tray}
      <View style={[styles.surface, isExpanded ? styles.expanded : styles.capsule]}>
        <GlassBackdrop />
        {/* Keep the editor under the same parent while expanding so focus and selection survive. */}
        <View style={isExpanded ? styles.editorExpanded : styles.editorRest}>
          {!isExpanded
            ? (leading ?? (
                <IconButton
                  icon="plus"
                  accessibilityLabel="Add attachment"
                  size={44}
                  strokeWidth={1.6}
                  disabledOpacity={1}
                  onPress={onAdd}
                  disabled={!onAdd}
                />
              ))
            : null}
          {input}
          {!isExpanded
            ? (trailing ?? (
                <>
                  <IconButton
                    icon="mic"
                    accessibilityLabel="Voice input"
                    size={38}
                    disabledOpacity={1}
                    onPress={onMic}
                    disabled={!onMic}
                  />
                  {sendButton}
                </>
              ))
            : null}
        </View>
        {isExpanded ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {leading ?? (
              <IconButton
                icon="plus"
                accessibilityLabel="Add attachment"
                size={36}
                strokeWidth={1.6}
                disabledOpacity={1}
                onPress={onAdd}
                disabled={!onAdd}
              />
            )}
            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
              {(controls ?? defaultControls).map((control) => (
                <Pressable
                  key={control.key}
                  onPress={control.onPress}
                  accessibilityRole="button"
                  style={{
                    height: 28,
                    paddingHorizontal: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 1,
                  }}
                >
                  {control.swatch ? (
                    <View
                      style={{
                        width: 7,
                        height: 9,
                        borderRadius: 1,
                        backgroundColor: control.swatch,
                      }}
                    />
                  ) : control.icon ? (
                    <Icon name={control.icon} size={13} />
                  ) : null}
                  <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
                    {control.label}
                  </Text>
                  <Icon name="chevD" size={10} color={colors["fg-3"]} />
                </Pressable>
              ))}
            </View>
            {trailing ?? sendButton}
          </View>
        ) : null}
      </View>
    </KeyboardStickyView>
  );
}
const styles = StyleSheet.create({
  floating: { position: "absolute", bottom: 0, left: 0, right: 0 },
  surface: {
    overflow: "hidden",
    backgroundColor: "#141414E0",
    borderWidth: 1,
    borderColor: "#FFFFFF12",
    boxShadow: "inset 0px 1px 0px #FFFFFF08",
  },
  capsule: {
    height: 52,
    borderRadius: 26,
  },
  editorRest: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 9,
    gap: 2,
  },
  editorExpanded: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  expanded: {
    borderRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#141414EB",
  },
});
