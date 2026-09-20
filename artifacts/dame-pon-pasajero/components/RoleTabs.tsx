import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import { iconSizes, radii, spacing, typography } from '@workspace/dame-pon-shared/constants/designSystem';

export type RoleTab = 'home' | 'rides' | 'chat' | 'profile';

const tabs: Array<{ key: RoleTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { key: 'home', label: 'Inicio', icon: 'map' },
  { key: 'rides', label: 'Viajes', icon: 'clock' },
  { key: 'chat', label: 'Chat', icon: 'message-circle' },
  { key: 'profile', label: 'Perfil', icon: 'user' },
];

export function RoleTabs({ activeTab, onChange }: { activeTab: RoleTab; onChange: (tab: RoleTab) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            testID={`tab-${tab.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          >
            <Feather name={tab.icon} size={iconSizes.control} color={active ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.label, { color: active ? colors.primary : colors.mutedForeground }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, flexDirection: 'row', paddingBottom: spacing.sm, paddingTop: spacing.sm },
  item: { alignItems: 'center', flex: 1, gap: spacing.xs, minHeight: 46, justifyContent: 'center' },
  label: { fontFamily: typography.family.semibold, fontSize: 11 },
});