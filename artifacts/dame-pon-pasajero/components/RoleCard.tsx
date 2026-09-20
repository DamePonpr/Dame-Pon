import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import type { UserRole } from '@workspace/dame-pon-shared/lib/roles';

interface RoleCardProps {
  role: UserRole;
  selected: boolean;
  onPress: () => void;
}

export function RoleCard({ role, selected, onPress }: RoleCardProps) {
  const colors = useColors();
  const isDriver = role === 'conductor';
  return (
    <Pressable
      testID={`role-${role}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
        pressed && { opacity: 0.84 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: selected ? 'rgba(255,255,255,0.16)' : colors.secondary }]}>
        <Feather name={isDriver ? 'navigation' : 'user'} size={20} color={selected ? colors.primaryForeground : colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: selected ? colors.primaryForeground : colors.foreground }]}>
          {isDriver ? 'Soy conductor' : 'Soy pasajero'}
        </Text>
        <Text style={[styles.description, { color: selected ? 'rgba(255,255,255,0.72)' : colors.mutedForeground }]}>
          {isDriver ? 'Comparte tus rutas y genera ingresos' : 'Llega a donde quieras, sin complicaciones'}
        </Text>
      </View>
      <Feather name={selected ? 'check-circle' : 'circle'} size={21} color={selected ? colors.primaryForeground : colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 17,
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  description: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
  },
});
