import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, type UserRole } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { AppButton } from '@/components/AppButton';
import { BrandMark } from '@/components/BrandMark';
import { LiveRideMap } from '@/components/LiveRideMap';
import {
  acceptTrip,
  getDriverActiveTrip,
  getDriverLocation,
  getDriverSetup,
  getOpenTrips,
  getPassengerActiveTrip,
  getTripHistory,
  rateTrip,
  requestTrip,
  saveDriverSetup,
  setDriverAvailability,
  subscribeToOpenTrips,
  subscribeToDriverLocation,
  subscribeToTrips,
  tripDestination,
  type DriverSetup,
  type Trip,
  type TripHistoryItem,
  type VehicleDraft,
  updateDriverLocation,
  updateTripStatus,
} from '@/lib/rideService';

const emptyVehicle: VehicleDraft = {
  make: '',
  model: '',
  year: '',
  color: '',
  licensePlate: '',
};

export function RoleHome({ role }: { role: UserRole }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, user, signOut } = useAuth();
  const isDriver = role === 'driver';
  const [isAvailable, setIsAvailable] = useState(false);
  const [driverSetup, setDriverSetup] = useState<DriverSetup | null>(null);
  const [driverTrips, setDriverTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [showDestination, setShowDestination] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [destination, setDestination] = useState('');
  const [savedDestination, setSavedDestination] = useState('');
  const [vehicle, setVehicle] = useState<VehicleDraft>(emptyVehicle);
  const [loading, setLoading] = useState(true);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [requestingTrip, setRequestingTrip] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [pickupCoordinates, setPickupCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState('');
  const [passengerLocation, setPassengerLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapLocationLoading, setMapLocationLoading] = useState(false);
  const [mapLocationError, setMapLocationError] = useState('');
  const [driverTrackingActive, setDriverTrackingActive] = useState(false);
  const [driverTrackingError, setDriverTrackingError] = useState('');
  const [tripActionLoading, setTripActionLoading] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [history, setHistory] = useState<TripHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [setupError, setSetupError] = useState('');
  const [requestError, setRequestError] = useState('');
  const activeTripRefreshInFlight = useRef(false);
  const openTripsRefreshInFlight = useRef(false);

  const firstName = profile?.full_name?.trim().split(' ')[0] || (isDriver ? 'conductor' : 'viajero');
  const driverReady = Boolean(driverSetup?.driver && driverSetup?.vehicle);

  const refreshActiveTrip = useCallback(async () => {
    if (!user?.id || activeTripRefreshInFlight.current) return;
    activeTripRefreshInFlight.current = true;
    try {
      const result = isDriver
        ? await getDriverActiveTrip(user.id)
        : await getPassengerActiveTrip(user.id);

      if (result.error) {
        isDriver ? setSetupError(result.error) : setRequestError(result.error);
        return;
      }
      setActiveTrip(result.data);
      setRatingSubmitted(false);
    } finally {
      activeTripRefreshInFlight.current = false;
    }
  }, [isDriver, user?.id]);

  const refreshOpenTrips = useCallback(async () => {
    if (!isDriver || !isAvailable || openTripsRefreshInFlight.current) return;
    openTripsRefreshInFlight.current = true;
    try {
      const result = await getOpenTrips();
      if (result.error) {
        setSetupError(result.error);
        return;
      }
      setDriverTrips(result.data ?? []);
    } finally {
      openTripsRefreshInFlight.current = false;
    }
  }, [isAvailable, isDriver]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoading(true);

    const load = async () => {
      if (isDriver) {
        const result = await getDriverSetup(user.id);
        if (active) {
          setDriverSetup(result.data);
          setIsAvailable(result.data?.driver?.is_online === true);
          setSetupError(result.error ?? '');
          setLoading(false);
        }
      } else {
        if (active) {
          setLoading(false);
        }
      }
      await refreshActiveTrip();
    };

    void load();
    return () => {
      active = false;
    };
  }, [isDriver, refreshActiveTrip, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToTrips(user.id, isDriver ? 'driver' : 'passenger', () => {
      void refreshActiveTrip();
    });
    const poll = setInterval(() => {
      void refreshActiveTrip();
    }, 12_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshActiveTrip();
    });

    return () => {
      clearInterval(poll);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [isDriver, refreshActiveTrip, user?.id]);

  useEffect(() => {
    if (!isDriver || !isAvailable) {
      setDriverTrips([]);
      return;
    }
    void refreshOpenTrips();
    const unsubscribe = subscribeToOpenTrips(() => {
      void refreshOpenTrips();
    });
    const poll = setInterval(() => {
      void refreshOpenTrips();
    }, 12_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshOpenTrips();
    });

    return () => {
      clearInterval(poll);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [isAvailable, isDriver, refreshOpenTrips]);

  const loadPassengerLocation = useCallback(async (requestPermission: boolean) => {
    if (isDriver) return;
    setMapLocationLoading(true);
    setMapLocationError('');
    try {
      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        setMapLocationError('Activa la ubicación para verte en el mapa y facilitar el punto de recogida.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setPassengerLocation(location);
      setPickupCoordinates(location);
    } catch {
      setMapLocationError('No pudimos obtener tu ubicación. Verifica que el GPS esté activo e inténtalo de nuevo.');
    } finally {
      setMapLocationLoading(false);
    }
  }, [isDriver]);

  useEffect(() => {
    if (!isDriver) void loadPassengerLocation(false);
  }, [isDriver, loadPassengerLocation]);

  useEffect(() => {
    if (isDriver || !activeTrip?.driver_id || !['aceptado', 'en_curso'].includes(activeTrip.status)) {
      setDriverLocation(null);
      return;
    }
    let refreshInFlight = false;
    const refresh = async () => {
      if (refreshInFlight || !activeTrip.driver_id) return;
      refreshInFlight = true;
      try {
        const result = await getDriverLocation(activeTrip.driver_id);
        if (result.error) {
          setMapLocationError(result.error);
          return;
        }
        setDriverLocation(result.data);
      } finally {
        refreshInFlight = false;
      }
    };
    void refresh();
    const unsubscribe = subscribeToDriverLocation(activeTrip.driver_id, () => void refresh());
    const poll = setInterval(() => void refresh(), 12_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(poll);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [activeTrip?.driver_id, activeTrip?.status, isDriver]);

  const enableDriverTracking = useCallback(async () => {
    setDriverTrackingError('');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setDriverTrackingActive(false);
      setDriverTrackingError('Necesitamos tu ubicación para que el pasajero pueda verte mientras vas a recogerlo.');
      return;
    }
    setDriverTrackingActive(true);
  }, []);

  useEffect(() => {
    const shouldTrack = isDriver && isAvailable && activeTrip?.status === 'aceptado';
    if (!shouldTrack) {
      setDriverTrackingActive(false);
      setDriverTrackingError('');
      return;
    }
    void Location.getForegroundPermissionsAsync().then((permission) => {
      if (permission.granted) {
        setDriverTrackingActive(true);
      } else {
        setDriverTrackingError('Comparte tu ubicación para que el pasajero pueda seguir tu llegada en el mapa.');
      }
    });
  }, [activeTrip?.id, activeTrip?.status, isAvailable, isDriver]);

  useEffect(() => {
    if (!user?.id || !driverTrackingActive || !isDriver || !isAvailable || activeTrip?.status !== 'aceptado') return;
    let updateInFlight = false;
    const publishLocation = async () => {
      if (updateInFlight) return;
      updateInFlight = true;
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const result = await updateDriverLocation(user.id, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (result.error) {
          setDriverTrackingError(result.error);
          return;
        }
        setDriverTrackingError('');
      } catch {
        setDriverTrackingError('No pudimos actualizar tu ubicación. Verifica que el GPS siga activo.');
      } finally {
        updateInFlight = false;
      }
    };
    void publishLocation();
    const interval = setInterval(() => void publishLocation(), 12_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void publishLocation();
    });
    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [activeTrip?.status, driverTrackingActive, isAvailable, isDriver, user?.id]);

  const handleAvailability = async () => {
    if (!user?.id) return;
    if (!driverReady) {
      setShowVehicle(true);
      return;
    }
    const nextValue = !isAvailable;
    const result = await setDriverAvailability(user.id, nextValue);
    if (result.error) {
      setSetupError(result.error);
      return;
    }
    setIsAvailable(nextValue);
    void Haptics.selectionAsync();
  };

  const handleSaveVehicle = async () => {
    if (!user?.id) return;
    if (!vehicle.make.trim() || !vehicle.model.trim() || !vehicle.year.trim() || !vehicle.color.trim() || !vehicle.licensePlate.trim()) {
      setSetupError('Completa todos los datos del vehículo para continuar.');
      return;
    }
    setSavingVehicle(true);
    setSetupError('');
    const result = await saveDriverSetup(user.id, vehicle);
    setSavingVehicle(false);
    if (result.error) {
      setSetupError(result.error);
      return;
    }
    setDriverSetup(result.data);
    setShowVehicle(false);
    setVehicle(emptyVehicle);
    Alert.alert('Vehículo guardado', 'Ya puedes activar tu disponibilidad y empezar a recibir solicitudes.');
  };

  const preparePickupLocation = async () => {
    setLocationLoading(true);
    setLocationError('');
    setPickupCoordinates(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Necesitamos permiso de ubicación para indicar dónde recogerte. Actívalo e inténtalo de nuevo.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setLocationError('No pudimos obtener una ubicación válida. Verifica que la ubicación del dispositivo esté activa.');
        return;
      }
      setPickupCoordinates({ latitude, longitude });
    } catch {
      setLocationError('No pudimos obtener tu ubicación. Verifica que la ubicación del dispositivo esté activa e inténtalo de nuevo.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleOpenDestination = () => {
    setRequestError('');
    setLocationError('');
    setShowDestination(true);
    void preparePickupLocation();
  };

  const handleRequestTrip = async () => {
    if (!user?.id || !destination.trim()) return;
    if (!pickupCoordinates) {
      setLocationError('Espera a que podamos confirmar tu ubicación antes de solicitar el viaje.');
      return;
    }
    setRequestingTrip(true);
    setRequestError('');
    const result = await requestTrip(user.id, destination, {
      address: 'Ubicación actual',
      latitude: pickupCoordinates.latitude,
      longitude: pickupCoordinates.longitude,
    });
    setRequestingTrip(false);
    if (result.error) {
      setRequestError(result.error);
      return;
    }
    setActiveTrip(result.data);
    setSavedDestination(destination.trim());
    setDestination('');
    setShowDestination(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAcceptTrip = async (trip: Trip) => {
    if (!user?.id) return;
    const result = await acceptTrip(trip.id, user.id);
    if (result.error) {
      setSetupError(result.error);
      return;
    }
    setDriverTrips((current) => current.filter((item) => item.id !== trip.id));
    setActiveTrip(result.data);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleTripStatus = async (status: 'en_curso' | 'completado') => {
    if (!user?.id || !activeTrip) return;
    setTripActionLoading(true);
    setSetupError('');
    const result = await updateTripStatus(activeTrip.id, user.id, status);
    setTripActionLoading(false);
    if (result.error) {
      setSetupError(result.error);
      return;
    }
    setActiveTrip(result.data);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRating = async (score: number) => {
    if (!user?.id || !activeTrip) return;
    setRatingLoading(true);
    const result = await rateTrip(activeTrip, user.id, score);
    setRatingLoading(false);
    if (result.error) {
      isDriver ? setSetupError(result.error) : setRequestError(result.error);
      return;
    }
    setActiveTrip(null);
    setRatingSubmitted(false);
    if (isDriver && isAvailable) {
      const openTripsResult = await getOpenTrips();
      setDriverTrips(openTripsResult.data ?? []);
      if (openTripsResult.error) setSetupError(openTripsResult.error);
    }
    Alert.alert('Calificación enviada', 'Gracias por compartir cómo estuvo el viaje.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleOpenHistory = async () => {
    if (!user?.id) return;
    setShowHistory(true);
    setHistoryLoading(true);
    setHistoryError('');
    const result = await getTripHistory(user.id, isDriver ? 'driver' : 'passenger');
    setHistoryLoading(false);
    if (result.error) {
      setHistoryError(result.error);
      return;
    }
    setHistory(result.data ?? []);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <BrandMark compact />
        <Pressable
          testID="logout-button"
          accessibilityLabel="Cerrar sesión"
          onPress={() => {
            void Haptics.selectionAsync();
            void signOut();
          }}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.secondary }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="log-out" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greeting}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{isDriver ? 'PANEL DEL CONDUCTOR' : 'BUEN DÍA'}</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Hola, {firstName}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {isDriver ? 'Tu próxima oportunidad está a un toque.' : '¿A dónde te llevamos hoy?'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isDriver ? (
          <DriverContent
            colors={colors}
            isAvailable={isAvailable}
            driverReady={driverReady}
            driverTrips={driverTrips}
            activeTrip={activeTrip}
            tripActionLoading={tripActionLoading}
            ratingLoading={ratingLoading}
            ratingSubmitted={ratingSubmitted}
            setupError={setupError}
            driverTrackingActive={driverTrackingActive}
            driverTrackingError={driverTrackingError}
            onAvailability={handleAvailability}
            onVehicle={() => {
              setSetupError('');
              setShowVehicle(true);
            }}
            onAccept={handleAcceptTrip}
            onTripStatus={handleTripStatus}
            onRating={handleRating}
            onEnableTracking={() => void enableDriverTracking()}
          />
        ) : (
          <PassengerContent
            colors={colors}
            activeTrip={activeTrip}
            savedDestination={savedDestination}
            requestError={requestError}
            passengerLocation={passengerLocation}
            driverLocation={driverLocation}
            mapLocationLoading={mapLocationLoading}
            mapLocationError={mapLocationError}
            ratingLoading={ratingLoading}
            ratingSubmitted={ratingSubmitted}
            onRating={handleRating}
            onDestination={handleOpenDestination}
            onEnableLocation={() => void loadPassengerLocation(true)}
          />
        )}

        {!loading ? (
          <Pressable
            testID="trip-history-button"
            accessibilityLabel="Abrir historial de viajes"
            onPress={() => void handleOpenHistory()}
            style={({ pressed }) => [styles.historyButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
          >
            <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="clock" size={18} color={colors.primary} />
            </View>
            <View style={styles.infoCopy}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>Historial de viajes</Text>
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Consulta tus trayectos y calificaciones anteriores.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </ScrollView>

      <DestinationModal
        colors={colors}
        insetsBottom={insets.bottom}
        visible={showDestination}
        destination={destination}
        loading={requestingTrip}
        locationLoading={locationLoading}
        locationReady={pickupCoordinates !== null}
        locationError={locationError}
        error={requestError}
        onChange={setDestination}
        onClose={() => setShowDestination(false)}
        onRetryLocation={() => void preparePickupLocation()}
        onSubmit={handleRequestTrip}
      />
      <VehicleModal
        colors={colors}
        insetsBottom={insets.bottom}
        visible={showVehicle}
        vehicle={vehicle}
        loading={savingVehicle}
        error={setupError}
        onChange={setVehicle}
        onClose={() => setShowVehicle(false)}
        onSubmit={handleSaveVehicle}
      />
      <HistoryModal
        colors={colors}
        insetsBottom={insets.bottom}
        visible={showHistory}
        history={history}
        loading={historyLoading}
        error={historyError}
        onClose={() => setShowHistory(false)}
        onRetry={() => void handleOpenHistory()}
      />
    </View>
  );
}

function PassengerContent({
  colors,
  activeTrip,
  savedDestination,
  requestError,
  passengerLocation,
  driverLocation,
  mapLocationLoading,
  mapLocationError,
  ratingLoading,
  ratingSubmitted,
  onRating,
  onDestination,
  onEnableLocation,
}: {
  colors: ReturnType<typeof useColors>;
  activeTrip: Trip | null;
  savedDestination: string;
  requestError: string;
  passengerLocation: { latitude: number; longitude: number } | null;
  driverLocation: { latitude: number; longitude: number } | null;
  mapLocationLoading: boolean;
  mapLocationError: string;
  ratingLoading: boolean;
  ratingSubmitted: boolean;
  onRating: (score: number) => void;
  onDestination: () => void;
  onEnableLocation: () => void;
}) {
  const pickupLocation = activeTrip
    && Number.isFinite(activeTrip.pickup_lat)
    && Number.isFinite(activeTrip.pickup_lng)
    ? { latitude: Number(activeTrip.pickup_lat), longitude: Number(activeTrip.pickup_lng) }
    : null;

  return (
    <>
      <View style={[styles.mapCard, { backgroundColor: colors.primary }]}>
        <LiveRideMap
          passengerLocation={passengerLocation}
          driverLocation={driverLocation}
          pickupLocation={pickupLocation}
        />
        <View style={styles.mapOverlay}>
          <Text style={styles.mapLabel}>{driverLocation ? 'Tu conductor está en camino' : 'Tu ubicación en Dame Pon'}</Text>
          <Text style={styles.mapMeta}>
            {driverLocation ? 'La posición se actualiza automáticamente' : 'El conductor aparecerá aquí cuando acepte'}
          </Text>
        </View>
        {!passengerLocation ? (
          <View style={styles.mapPermissionOverlay}>
            <Text style={styles.mapPermissionText}>
              {mapLocationError || 'Necesitamos tu ubicación para mostrarte en el mapa.'}
            </Text>
            <Pressable
              onPress={onEnableLocation}
              disabled={mapLocationLoading}
              style={({ pressed }) => [styles.mapPermissionButton, pressed && { opacity: 0.8 }]}
            >
              {mapLocationLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.mapPermissionButtonText, { color: colors.primary }]}>Activar ubicación</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

      {activeTrip ? (
        <View style={[styles.activeTripCard, { backgroundColor: colors.primary }]}>
          <View style={styles.activeTripHeader}>
            <View>
              <Text style={styles.inverseEyebrow}>VIAJE ACTIVO</Text>
              <Text style={styles.inverseTitle}>{tripStatusLabel(activeTrip.status)}</Text>
            </View>
            <Feather name="navigation" size={21} color="#FFFFFF" />
          </View>
          <Text style={styles.inverseSubtitle}>Destino: {tripDestination(activeTrip)}</Text>
          {activeTrip.status === 'completado' ? (
            <RatingControl loading={ratingLoading} submitted={ratingSubmitted} onRating={onRating} />
          ) : null}
        </View>
      ) : (
        <Pressable
          testID="destination-button"
          onPress={onDestination}
          style={({ pressed }) => [styles.destinationCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.82 }]}
        >
          <View style={[styles.searchIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="search" size={18} color={colors.primary} />
          </View>
          <View style={styles.destinationCopy}>
            <Text style={[styles.destinationLabel, { color: colors.mutedForeground }]}>¿A dónde vas?</Text>
            <Text style={[styles.destinationValue, { color: savedDestination ? colors.foreground : colors.mutedForeground }]}>
              {savedDestination || 'Busca un destino'}
            </Text>
          </View>
          <Feather name="arrow-up-right" size={19} color={colors.primary} />
        </Pressable>
      )}

      {requestError ? <Text style={[styles.inlineError, { color: colors.destructive }]}>{requestError}</Text> : null}
      <View style={[styles.reassurance, { backgroundColor: colors.secondary }]}>
        <Feather name="shield" size={17} color={colors.primary} />
        <Text style={[styles.reassuranceText, { color: colors.primary }]}>Viajes confiables, tarifas claras y apoyo cuando lo necesites.</Text>
      </View>
    </>
  );
}

function DriverContent({
  colors,
  isAvailable,
  driverReady,
  driverTrips,
  activeTrip,
  tripActionLoading,
  ratingLoading,
  ratingSubmitted,
  setupError,
  driverTrackingActive,
  driverTrackingError,
  onAvailability,
  onVehicle,
  onAccept,
  onTripStatus,
  onRating,
  onEnableTracking,
}: {
  colors: ReturnType<typeof useColors>;
  isAvailable: boolean;
  driverReady: boolean;
  driverTrips: Trip[];
  activeTrip: Trip | null;
  tripActionLoading: boolean;
  ratingLoading: boolean;
  ratingSubmitted: boolean;
  setupError: string;
  driverTrackingActive: boolean;
  driverTrackingError: string;
  onAvailability: () => void;
  onVehicle: () => void;
  onAccept: (trip: Trip) => void;
  onTripStatus: (status: 'en_curso' | 'completado') => void;
  onRating: (score: number) => void;
  onEnableTracking: () => void;
}) {
  return (
    <>
      <View style={[styles.availabilityCard, { backgroundColor: colors.primary }]}>
        <View style={styles.availabilityCopy}>
          <Text style={styles.inverseEyebrow}>ESTADO DE CONEXIÓN</Text>
          <Text style={styles.inverseTitle}>{isAvailable ? 'Estás disponible' : 'Estás desconectado'}</Text>
          <Text style={styles.inverseSubtitle}>
            {isAvailable ? 'Podrás recibir solicitudes cercanas.' : 'Actívate cuando quieras comenzar.'}
          </Text>
        </View>
        <Pressable
          testID="availability-toggle"
          onPress={onAvailability}
          style={[styles.toggle, { backgroundColor: isAvailable ? '#B7E3C5' : 'rgba(255,255,255,0.16)' }]}
        >
          <View style={[styles.toggleThumb, { backgroundColor: isAvailable ? '#247A48' : '#FFFFFF', alignSelf: isAvailable ? 'flex-end' : 'flex-start' }]} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Stat label={isAvailable ? 'Solicitudes' : 'Viajes hoy'} value={String(driverTrips.length)} icon="navigation" colors={colors} />
        <Stat label="Calificación" value="—" icon="star" colors={colors} />
      </View>

      <Pressable
        testID="vehicle-setup"
        onPress={onVehicle}
        style={({ pressed }) => [styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
          <Feather name={driverReady ? 'check' : 'truck'} size={18} color={colors.primary} />
        </View>
        <View style={styles.infoCopy}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>{driverReady ? 'Vehículo listo' : 'Completa tu vehículo'}</Text>
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            {driverReady ? 'Puedes actualizar tus datos cuando quieras.' : 'Necesitas estos datos para recibir viajes.'}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>

      {setupError ? <Text style={[styles.inlineError, { color: colors.destructive }]}>{setupError}</Text> : null}

      {activeTrip ? (
        <View style={[styles.driverActiveTrip, { backgroundColor: colors.primary }]}>
          <Text style={styles.inverseEyebrow}>VIAJE ACTUAL</Text>
          <Text style={styles.inverseTitle}>{tripStatusLabel(activeTrip.status)}</Text>
          <Text style={styles.inverseSubtitle}>Destino: {tripDestination(activeTrip)}</Text>
          {activeTrip.status === 'aceptado' ? (
            <View style={styles.trackingCard}>
              <Feather
                name={driverTrackingActive ? 'radio' : 'map-pin'}
                size={18}
                color={driverTrackingActive ? '#B7E3C5' : '#FFFFFF'}
              />
              <View style={styles.trackingCopy}>
                <Text style={styles.trackingTitle}>
                  {driverTrackingActive ? 'Ubicación compartida' : 'Comparte tu ubicación'}
                </Text>
                <Text style={styles.trackingText}>
                  {driverTrackingError || (driverTrackingActive
                    ? 'El pasajero puede seguir tu llegada en el mapa.'
                    : 'La necesitamos para mostrarle al pasajero que vas en camino.')}
                </Text>
              </View>
              {!driverTrackingActive ? (
                <Pressable onPress={onEnableTracking} style={styles.trackingButton}>
                  <Text style={[styles.trackingButtonText, { color: colors.primary }]}>Activar</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {activeTrip.status === 'aceptado' ? (
            <AppButton label="Iniciar viaje" onPress={() => onTripStatus('en_curso')} loading={tripActionLoading} testID="start-trip" />
          ) : activeTrip.status === 'en_curso' ? (
            <AppButton label="Completar viaje" onPress={() => onTripStatus('completado')} loading={tripActionLoading} testID="complete-trip" />
          ) : (
            <RatingControl loading={ratingLoading} submitted={ratingSubmitted} onRating={onRating} />
          )}
        </View>
      ) : null}

      {isAvailable && !activeTrip ? (
        <View style={styles.requestsSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Solicitudes disponibles</Text>
            <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>{driverTrips.length}</Text>
          </View>
          {driverTrips.length ? (
            driverTrips.map((trip) => (
              <View key={trip.id} style={[styles.tripCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.tripIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="map-pin" size={17} color={colors.primary} />
                </View>
                <View style={styles.tripCopy}>
                  <Text style={[styles.tripLabel, { color: colors.mutedForeground }]}>NUEVA SOLICITUD</Text>
                  <Text style={[styles.tripDestination, { color: colors.foreground }]}>{tripDestination(trip)}</Text>
                </View>
                <Pressable
                  testID={`accept-trip-${trip.id}`}
                  onPress={() => onAccept(trip)}
                  style={({ pressed }) => [styles.acceptButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.acceptLabel}>Aceptar</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="inbox" size={20} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aún no hay solicitudes</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Te avisaremos cuando haya un viaje cerca.</Text>
            </View>
          )}
        </View>
      ) : null}
    </>
  );
}

function DestinationModal({
  colors,
  insetsBottom,
  visible,
  destination,
  loading,
  locationLoading,
  locationReady,
  locationError,
  error,
  onChange,
  onClose,
  onRetryLocation,
  onSubmit,
}: {
  colors: ReturnType<typeof useColors>;
  insetsBottom: number;
  visible: boolean;
  destination: string;
  loading: boolean;
  locationLoading: boolean;
  locationReady: boolean;
  locationError: string;
  error: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onRetryLocation: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.background, paddingBottom: insetsBottom + 22 }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>¿A dónde vas?</Text>
          <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Usaremos tu ubicación actual como punto de recogida.</Text>
          <View style={[styles.modalInputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="map-pin" size={18} color={colors.primary} />
            <TextInput
              autoFocus
              value={destination}
              onChangeText={onChange}
              placeholder="Ej. Plaza Las Américas"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.modalInput, { color: colors.foreground }]}
            />
          </View>
          <View style={[styles.locationStatus, { backgroundColor: colors.secondary }]}>
            {locationLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={locationReady ? 'check-circle' : 'alert-circle'}
                size={17}
                color={locationReady ? colors.primary : colors.destructive}
              />
            )}
            <Text style={[styles.locationStatusText, { color: locationReady ? colors.primary : colors.mutedForeground }]}>
              {locationLoading
                ? 'Obteniendo tu ubicación…'
                : locationReady
                  ? 'Ubicación confirmada'
                  : locationError || 'Necesitamos confirmar tu ubicación.'}
            </Text>
          </View>
          {locationError && !locationLoading ? (
            <Pressable onPress={onRetryLocation} style={styles.retryLocation}>
              <Text style={[styles.retryLocationText, { color: colors.primary }]}>Intentar obtener ubicación nuevamente</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={[styles.inlineError, { color: colors.destructive }]}>{error}</Text> : null}
          <AppButton
            label="Solicitar viaje"
            onPress={onSubmit}
            disabled={!destination.trim() || !locationReady || locationLoading}
            loading={loading}
            testID="confirm-destination"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VehicleModal({
  colors,
  insetsBottom,
  visible,
  vehicle,
  loading,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  colors: ReturnType<typeof useColors>;
  insetsBottom: number;
  visible: boolean;
  vehicle: VehicleDraft;
  loading: boolean;
  error: string;
  onChange: (vehicle: VehicleDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          accessibilityLabel="Cerrar formulario de vehículo"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <ScrollView
          style={styles.vehicleModalScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[styles.modalCard, { backgroundColor: colors.background, paddingBottom: insetsBottom + 22 }]}
        >
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Tu vehículo</Text>
          <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Estos datos se mostrarán al pasajero antes del viaje.</Text>
          <ModalInput label="Marca" value={vehicle.make} placeholder="Toyota" colors={colors} onChangeText={(value) => onChange({ ...vehicle, make: value })} />
          <ModalInput label="Modelo" value={vehicle.model} placeholder="Corolla" colors={colors} onChangeText={(value) => onChange({ ...vehicle, model: value })} />
          <View style={styles.twoInputs}>
            <View style={styles.halfInput}>
              <ModalInput label="Año" value={vehicle.year} placeholder="2022" keyboardType="number-pad" colors={colors} onChangeText={(value) => onChange({ ...vehicle, year: value })} />
            </View>
            <View style={styles.halfInput}>
              <ModalInput label="Color" value={vehicle.color} placeholder="Blanco" colors={colors} onChangeText={(value) => onChange({ ...vehicle, color: value })} />
            </View>
          </View>
          <ModalInput label="Matrícula" value={vehicle.licensePlate} placeholder="ABC-123" autoCapitalize="characters" colors={colors} onChangeText={(value) => onChange({ ...vehicle, licensePlate: value })} />
          {error ? <Text style={[styles.inlineError, { color: colors.destructive }]}>{error}</Text> : null}
          <AppButton label="Guardar vehículo" onPress={onSubmit} loading={loading} testID="save-vehicle" />
        </ScrollView>
      </View>
    </Modal>
  );
}

function HistoryModal({
  colors,
  insetsBottom,
  visible,
  history,
  loading,
  error,
  onClose,
  onRetry,
}: {
  colors: ReturnType<typeof useColors>;
  insetsBottom: number;
  visible: boolean;
  history: TripHistoryItem[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.historyScreen, { backgroundColor: colors.background, paddingBottom: insetsBottom }]}>
        <View style={[styles.historyHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Viajes anteriores</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Tus trayectos completados y sus valoraciones.</Text>
          </View>
          <Pressable
            testID="close-trip-history"
            accessibilityLabel="Cerrar historial"
            onPress={onClose}
            style={styles.historyClose}
          >
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.historyState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.historyState}>
            <Feather name="alert-circle" size={24} color={colors.destructive} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No pudimos abrir tu historial</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{error}</Text>
            <Pressable onPress={onRetry} style={[styles.retryHistory, { backgroundColor: colors.primary }]}>
              <Text style={styles.acceptLabel}>Intentar de nuevo</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.historyList}
            showsVerticalScrollIndicator={false}
            scrollEnabled={history.length > 0}
          >
            {history.length ? history.map((item) => (
              <HistoryCard key={item.trip.id} item={item} colors={colors} />
            )) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="clock" size={22} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aún no tienes viajes completados</Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Cuando termines un viaje, aparecerá aquí.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function HistoryCard({ item, colors }: { item: TripHistoryItem; colors: ReturnType<typeof useColors> }) {
  const date = new Date(item.trip.completed_at ?? item.trip.requested_at);
  const formattedDate = Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);

  return (
    <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.historyCardTop}>
        <View style={[styles.tripIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="map-pin" size={17} color={colors.primary} />
        </View>
        <View style={styles.tripCopy}>
          <Text style={[styles.tripDestination, { color: colors.foreground }]}>{tripDestination(item.trip)}</Text>
          <Text style={[styles.historyDate, { color: colors.mutedForeground }]}>{formattedDate}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.statusBadgeText, { color: colors.primary }]}>Completado</Text>
        </View>
      </View>
      <View style={[styles.historyRatings, { borderTopColor: colors.border }]}>
        <RatingSummary label="Enviada" score={item.sentRating} colors={colors} />
        <RatingSummary label="Recibida" score={item.receivedRating} colors={colors} />
      </View>
    </View>
  );
}

function RatingSummary({ label, score, colors }: { label: string; score: number | null; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.ratingSummary}>
      <Text style={[styles.ratingSummaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.ratingSummaryValue}>
        <Feather name="star" size={15} color={score === null ? colors.mutedForeground : colors.primary} />
        <Text style={[styles.ratingSummaryScore, { color: colors.foreground }]}>{score === null ? 'Sin calificar' : `${score}/5`}</Text>
      </View>
    </View>
  );
}

function ModalInput({
  label,
  value,
  placeholder,
  colors,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  placeholder: string;
  colors: ReturnType<typeof useColors>;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'characters' | 'words';
}) {
  return (
    <View style={styles.modalField}>
      <Text style={[styles.modalFieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.modalInput, styles.vehicleInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
      />
    </View>
  );
}

function Stat({ label, value, icon, colors }: { label: string; value: string; icon: keyof typeof Feather.glyphMap; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={17} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function RatingControl({
  loading,
  submitted,
  onRating,
}: {
  loading: boolean;
  submitted: boolean;
  onRating: (score: number) => void;
}) {
  if (submitted) {
    return <Text style={styles.ratingThanks}>Gracias por tu calificación.</Text>;
  }
  return (
    <View style={styles.ratingBlock}>
      <Text style={styles.ratingLabel}>¿Cómo estuvo el viaje?</Text>
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map((score) => (
          <Pressable
            key={score}
            testID={`rate-trip-${score}`}
            disabled={loading}
            accessibilityLabel={`Calificar con ${score} estrellas`}
            onPress={() => onRating(score)}
            style={({ pressed }) => [styles.starButton, pressed && { opacity: 0.65 }]}
          >
            <Feather name="star" size={24} color="#F6C453" />
          </Pressable>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
    </View>
  );
}

function tripStatusLabel(status: string) {
  if (status === 'completado') return 'Viaje completado';
  if (status === 'aceptado') return 'Conductor en camino';
  if (status === 'en_curso') return 'Viaje en curso';
  return 'Buscando conductor';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, paddingHorizontal: 22, gap: 18 },
  greeting: { gap: 5, paddingTop: 8 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  loadingState: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  availabilityCard: { borderRadius: 22, padding: 20, minHeight: 165, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  availabilityCopy: { flex: 1, gap: 7, paddingRight: 12 },
  inverseEyebrow: { color: 'rgba(255,255,255,0.63)', fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.2 },
  inverseTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.4 },
  inverseSubtitle: { color: 'rgba(255,255,255,0.76)', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  toggle: { width: 48, height: 28, borderRadius: 20, padding: 4 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 17, padding: 15, gap: 7 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyButton: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, gap: 4 },
  infoTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  infoText: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 16 },
  mapCard: { height: 235, borderRadius: 22, overflow: 'hidden', position: 'relative' },
  mapGrid: { ...StyleSheet.absoluteFill, opacity: 0.85 },
  mapLine: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ rotate: '25deg' }] },
  mapLineOne: { width: '120%', top: 75, left: -15 },
  mapLineTwo: { width: '120%', top: 156, left: -10, transform: [{ rotate: '-18deg' }] },
  routeLine: { position: 'absolute', width: 3, height: 140, left: '47%', top: 46, transform: [{ rotate: '35deg' }], borderRadius: 3 },
  mapPin: { position: 'absolute', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, elevation: 3 },
  startPin: { top: 46, left: 68 },
  endPin: { bottom: 45, right: 58 },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  mapOverlay: { position: 'absolute', left: 18, bottom: 18, gap: 4 },
  mapLabel: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  mapMeta: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 11 },
  mapPermissionOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 26, backgroundColor: 'rgba(11,28,38,0.92)' },
  mapPermissionText: { color: '#FFFFFF', fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mapPermissionButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  mapPermissionButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  destinationCard: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchIcon: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  destinationCopy: { flex: 1, gap: 4 },
  destinationLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  destinationValue: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  activeTripCard: { borderRadius: 22, padding: 20, gap: 15 },
  activeTripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  driverActiveTrip: { borderRadius: 22, padding: 20, gap: 13 },
  trackingCard: { borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.12)' },
  trackingCopy: { flex: 1, gap: 3 },
  trackingTitle: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  trackingText: { color: 'rgba(255,255,255,0.74)', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  trackingButton: { minHeight: 36, paddingHorizontal: 13, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  trackingButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  ratingBlock: { gap: 9 },
  ratingLabel: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  starButton: { paddingVertical: 3 },
  ratingThanks: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  reassurance: { borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reassuranceText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  requestsSection: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  sectionMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  tripCard: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tripCopy: { flex: 1, gap: 4 },
  tripLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8 },
  tripDestination: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  acceptButton: { borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12 },
  acceptLabel: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', gap: 7 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center' },
  inlineError: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,28,38,0.5)' },
  vehicleModalScroll: { width: '100%', maxHeight: '92%' },
  modalCard: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, gap: 14 },
  modalHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#D6E1E6', alignSelf: 'center', marginBottom: 6 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  modalInputRow: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  locationStatus: { minHeight: 46, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  locationStatusText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  retryLocation: { alignSelf: 'flex-start', paddingVertical: 2 },
  retryLocationText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  modalField: { gap: 7 },
  modalFieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  vehicleInput: { flex: undefined, minHeight: 51, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  twoInputs: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1 },
  historyScreen: { flex: 1 },
  historyHeader: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  historyClose: { padding: 4 },
  historyState: { flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', gap: 10 },
  historyList: { padding: 22, gap: 12, flexGrow: 1 },
  historyCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 13 },
  historyCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyDate: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  statusBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  historyRatings: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', gap: 18 },
  ratingSummary: { flex: 1, gap: 5 },
  ratingSummaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  ratingSummaryValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingSummaryScore: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  retryHistory: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 4 },
});
