import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface LiveRideMapProps {
  passengerLocation: Coordinate | null;
  driverLocation: Coordinate | null;
  pickupLocation: Coordinate | null;
}

export function LiveRideMap({ passengerLocation, driverLocation, pickupLocation }: LiveRideMapProps) {
  const colors = useColors();
  const hasLocation = passengerLocation || pickupLocation;
  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
        <Feather name="map" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {driverLocation ? 'El conductor está en camino' : hasLocation ? 'Ubicación lista' : 'Mapa listo para tu viaje'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {driverLocation
          ? 'La ubicación asignada se actualiza automáticamente.'
          : 'El mapa interactivo se muestra en la app móvil.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 22,
    justifyContent: 'center',
    height: 56,
    width: 56,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 280,
  },
});