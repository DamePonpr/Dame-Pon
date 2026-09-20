import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radii, typography } from '@/constants/designSystem';

interface AppInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function AppInput({ label, error, ...props }: AppInputProps) {
  const colors = useColors();
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border, color: colors.foreground },
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  label: {
    fontFamily: typography.family.semibold,
    fontSize: typography.size.body,
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    fontFamily: typography.family.regular,
    fontSize: typography.size.label,
  },
  error: {
    fontFamily: typography.family.regular,
    fontSize: typography.size.caption,
  },
});
