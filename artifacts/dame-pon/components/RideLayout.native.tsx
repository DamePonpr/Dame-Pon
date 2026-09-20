import React, { type ReactNode, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { iconSizes, radii, spacing, typography } from '@/constants/designSystem';

export interface RideLayoutProps {
  map?: ReactNode;
  children: ReactNode;
  title?: string;
  snapPoints?: string[];
  onBack?: () => void;
}

export function RideLayout({ map, children, title, snapPoints = ['40%', '90%'], onBack }: RideLayoutProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={StyleSheet.absoluteFill}>{map}</View>
      {onBack ? (
        <Pressable
          accessibilityLabel="Volver"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { top: insets.top + spacing.sm, backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.72 },
          ]}
        >
          <Feather name="arrow-left" size={iconSizes.control} color={colors.foreground} />
        </Pressable>
      ) : null}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.mutedForeground, width: 42 }}
        style={styles.sheet}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.sheetContent,
             { paddingBottom: insets.bottom + 72 + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {title ? <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text> : null}
          {children}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { zIndex: 2 },
  sheetContent: { gap: spacing.lg, paddingHorizontal: spacing.screen, paddingTop: spacing.sm },
  sheetTitle: { fontFamily: typography.family.bold, fontSize: 22, letterSpacing: -0.5 },
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
});