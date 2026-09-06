import React, { useEffect, useRef } from 'react';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

interface LiveRideMapProps {
  passengerLocation: LatLng | null;
  driverLocation: LatLng | null;
  pickupLocation: LatLng | null;
}

export function LiveRideMap({ passengerLocation, driverLocation, pickupLocation }: LiveRideMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    const coordinates = [passengerLocation, driverLocation, pickupLocation].filter(
      (location): location is LatLng => location !== null,
    );
    if (!coordinates.length) return;

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 55, right: 55, bottom: 55, left: 55 },
      animated: true,
    });
  }, [driverLocation, passengerLocation, pickupLocation]);

  const initialCoordinate = passengerLocation ?? pickupLocation ?? driverLocation ?? {
    latitude: 18.2208,
    longitude: -66.5901,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          ...initialCoordinate,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        }}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {passengerLocation ? (
          <Marker
            coordinate={passengerLocation}
            title="Tu ubicación"
            pinColor="#0B1C26"
          />
        ) : null}
        {!passengerLocation && pickupLocation ? (
          <Marker
            coordinate={pickupLocation}
            title="Punto de recogida"
            pinColor="#0B1C26"
          />
        ) : null}
        {driverLocation ? (
          <Marker
            coordinate={driverLocation}
            title="Tu conductor"
            description="Ubicación actualizada en vivo"
            pinColor="#247A48"
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});