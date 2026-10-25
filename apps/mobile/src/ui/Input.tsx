import { useState } from "react";
import { Platform, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "../theme/tokens";
import { Text } from "./Text";
export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}
export function Input({
  label,
  error,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const input = (
    <TextInput
      {...props}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: props.editable === false }}
      placeholderTextColor={colors["fg-3"]}
      selectionColor={colors.accent}
      keyboardAppearance="dark"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        {
          height: 36,
          paddingVertical: 0,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: error ? colors.red : focused ? colors.accent : colors["line-2"],
          backgroundColor: colors["surface-2"],
          color: colors.fg,
          fontSize: 14,
          fontFamily: Platform.OS === "web" ? "system-ui" : undefined,
          outlineWidth: 0,
        },
        style,
      ]}
    />
  );
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="label">{label}</Text> : null}
      {input}
      {error ? (
        <Text variant="meta" color="red" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export const TextField = Input;
