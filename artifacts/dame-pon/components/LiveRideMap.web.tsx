import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

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
  const hasLocation = passengerLocation || pickupLocation;
  return (
    <View style={styles.container}>
      <Feather name="map" size={34} color="#FFFFFF" />
      <Text style={styles.title}>{hasLocation ? 'Ubicación lista' : 'Mapa disponible en la app móvil'}</Text>
      <Text style={styles.subtitle}>
        {driverLocation ? 'El conductor está compartiendo su ubicación.' : 'Abre Dame Pon en Expo Go para ver el mapa interactivo.'}
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
    backgroundColor: '#0B1C26',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});