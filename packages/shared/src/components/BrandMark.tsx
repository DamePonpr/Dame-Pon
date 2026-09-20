import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '../components/BrandLogo';
import { useColors } from '../hooks/useColors';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <BrandLogo
        role="pasajero"
        style={[styles.icon, compact && styles.compactIcon]}
      />
      <View>
        <Text style={[styles.name, { color: colors.foreground }, compact && styles.compactName]}>Dame Pon</Text>
        {!compact ? <Text style={[styles.tagline, { color: colors.mutedForeground }]}>Muévete a tu manera</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  icon: {
    width: 50,
    height: 50,
  },
  compactIcon: {
    width: 36,
    height: 36,
  },
  name: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    letterSpacing: -0.6,
  },
  compactName: {
    fontSize: 17,
    letterSpacing: -0.2,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
});
