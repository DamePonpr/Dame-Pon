import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type LngLat,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';

interface LiveRideMapProps {
  passengerLocation: Coordinate | null;
  driverLocation: Coordinate | null;
  pickupLocation: Coordinate | null;
  driverVehicleColor?: string | null;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

const OPENFREEMAP_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const OPENFREEMAP_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const PUERTO_RICO_CENTER: LngLat = [-66.5901, 18.2208];

function toLngLat(location: Coordinate): LngLat {
  return [location.longitude, location.latitude];
}

function getBounds(locations: Coordinate[]): LngLatBounds {
  const longitudes = locations.map(({ longitude }) => longitude);
  const latitudes = locations.map(({ latitude }) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudePadding = Math.max((maxLongitude - minLongitude) * 0.15, 0.002);
  const latitudePadding = Math.max((maxLatitude - minLatitude) * 0.15, 0.002);
  return [
    minLongitude - longitudePadding,
    minLatitude - latitudePadding,
    maxLongitude + longitudePadding,
    maxLatitude + latitudePadding,
  ];
}

function calculateBearing(previous: Coordinate, current: Coordinate) {
  const latitude = (current.latitude * Math.PI) / 180;
  const longitudeDelta = ((current.longitude - previous.longitude) * Math.PI) / 180;
  const latitudeDelta = ((current.latitude - previous.latitude) * Math.PI) / 180;
  const bearing = (Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(latitude),
    Math.cos((previous.latitude * Math.PI) / 180) * Math.sin(latitude)
      - Math.sin((previous.latitude * Math.PI) / 180) * Math.cos(latitude) * Math.cos(longitudeDelta),
  ) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export function LiveRideMap({ passengerLocation, driverLocation, pickupLocation, driverVehicleColor }: LiveRideMapProps) {
  const colors = useColors();
  const cameraRef = useRef<CameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [driverHeading, setDriverHeading] = useState(0);
  const previousDriverLocation = useRef<Coordinate | null>(null);
  const mapStyle = colors.isDark ? OPENFREEMAP_DARK_STYLE : OPENFREEMAP_LIGHT_STYLE;
  const locations = useMemo(
    () => [passengerLocation, driverLocation, pickupLocation].filter(
      (location): location is Coordinate => location !== null,
    ),
    [driverLocation, passengerLocation, pickupLocation],
  );
  const initialLocation = locations[0];

  useEffect(() => {
    if (driverLocation && previousDriverLocation.current) {
      const movedDistance = Math.abs(driverLocation.latitude - previousDriverLocation.current.latitude)
        + Math.abs(driverLocation.longitude - previousDriverLocation.current.longitude);
      if (movedDistance > 0.000001) setDriverHeading(calculateBearing(previousDriverLocation.current, driverLocation));
    }
    previousDriverLocation.current = driverLocation;
  }, [driverLocation]);

  useEffect(() => {
    if (!mapReady || locations.length === 0) return;
    if (locations.length === 1) {
      cameraRef.current?.easeTo({
        center: toLngLat(locations[0]),
        zoom: 14,
        duration: 650,
      });
      return;
    }
    cameraRef.current?.fitBounds(getBounds(locations), {
      padding: { top: 90, right: 48, bottom: 360, left: 48 },
      duration: 650,
    });
  }, [locations, mapReady]);

  return (
    <View style={styles.container}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        attribution
        logo
        compass={false}
        scaleBar={false}
        onDidFinishLoadingMap={() => {
          setMapError(false);
          setMapReady(true);
        }}
        onDidFailLoadingMap={() => setMapError(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: initialLocation ? toLngLat(initialLocation) : PUERTO_RICO_CENTER,
            zoom: initialLocation ? 14 : 8,
          }}
        />
        {passengerLocation ? (
          <Marker
            id="passenger-location"
            lngLat={toLngLat(passengerLocation)}
          >
            <View style={[styles.marker, { backgroundColor: colors.primary, borderColor: colors.primaryForeground }]}>
              <View style={[styles.markerCore, { backgroundColor: colors.primaryForeground }]} />
            </View>
          </Marker>
        ) : null}
        {!passengerLocation && pickupLocation ? (
          <Marker
            id="pickup-location"
            lngLat={toLngLat(pickupLocation)}
          >
            <View style={[styles.pickupMarker, { backgroundColor: colors.primaryForeground, borderColor: colors.primary }]}>
              <View style={[styles.pickupCore, { backgroundColor: colors.primary }]} />
            </View>
          </Marker>
        ) : null}
        {driverLocation ? (
          <Marker
            id="assigned-driver-location"
            lngLat={toLngLat(driverLocation)}
          >
            <View
              style={[
                styles.driverMarker,
                {
                  backgroundColor: driverVehicleColor || colors.primary,
                  borderColor: colors.primaryForeground,
                  transform: [{ rotate: `${driverHeading}deg` }],
                },
              ]}
            >
              <Text style={[styles.driverIcon, { color: colors.primaryForeground }]}>▰</Text>
            </View>
          </Marker>
        ) : null}
      </MapLibreMap>
      {mapError ? (
        <View style={[styles.statusOverlay, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>Mapa temporalmente fuera de línea</Text>
          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
            Conservamos tu viaje activo. Revisa tu conexión para volver a ver las calles y las ubicaciones.
          </Text>
        </View>
      ) : null}
      {!mapReady && !mapError ? (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.card }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Cargando mapa…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  marker: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 3,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  markerCore: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  pickupMarker: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  pickupCore: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  driverMarker: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 3,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  driverIcon: {
    fontSize: 20,
    fontWeight: '800',
  },
  statusOverlay: {
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 1,
    bottom: 16,
    left: 16,
    padding: 12,
    position: 'absolute',
    right: 16,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  statusText: {
    fontSize: 12,
    lineHeight: 17,
  },
  loadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'absolute',
    inset: 0,
  },
  loadingText: {
    fontSize: 12,
  },
});