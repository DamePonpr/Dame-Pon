import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { iconSizes, radii, spacing, typography } from '@/constants/designSystem';
import type { RideLayoutProps } from './RideLayout.native';

export function RideLayout({ map, children, title, onBack }: RideLayoutProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={StyleSheet.absoluteFill}>{map}</View>
      {onBack ? (
        <Pressable
          accessibilityLabel="Volver"
          onPress={onBack}
          style={[styles.backButton, { top: insets.top + spacing.sm, backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={iconSizes.control} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.handle, { backgroundColor: colors.mutedForeground }]} />
        {title ? <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  backButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    left: spacing.screen,
    position: 'absolute',
    width: 46,
    zIndex: 3,
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    maxHeight: '78%',
    padding: spacing.screen,
    position: 'absolute',
    right: 0,
  },
  handle: { alignSelf: 'center', borderRadius: radii.pill, height: 4, marginBottom: spacing.md, width: 42 },
  sheetTitle: { fontFamily: typography.family.bold, fontSize: 22, marginBottom: spacing.lg },
});