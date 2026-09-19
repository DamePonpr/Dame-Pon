import React from "react";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";
import type { InputFieldProps } from "@/types/type";
import { useColors } from "@/hooks/useColors";

export function InputField({ label, icon, error, ...props }: InputFieldProps & { error?: string }) {
  const colors = useColors();
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border }]}>
        {icon ? <Image source={icon} style={styles.icon} resizeMode="contain" /> : null}
        <TextInput
          {...props}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
        />
      </View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

export const AppInput = InputField;
export default InputField;

const styles = StyleSheet.create({
  wrapper: { gap: 8, marginBottom: 14 },
  label: { fontFamily: "Jakarta-SemiBold", fontSize: 14 },
  inputWrap: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  input: { flex: 1, fontFamily: "Jakarta", fontSize: 16, paddingVertical: 12 },
  icon: { width: 20, height: 20, marginRight: 10 },
  error: { fontFamily: "Jakarta", fontSize: 12 },
});