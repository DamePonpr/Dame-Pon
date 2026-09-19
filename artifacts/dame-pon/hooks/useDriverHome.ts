import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acceptTrip,
  getDriverActiveTrip,
  getDriverLocation,
  getDriverSetup,
  getMunicipalities,
  getOpenTrips,
  getReceivedRatingAverage,
  isLikelySessionError,
  saveDriverSetup,
  setDriverActiveMunicipality,
  setDriverAvailability,
  subscribeToOpenTrips,
  subscribeToTrips,
  updateDriverLocation,
  updateTripStatus,
  type DriverLocation,
  type DriverSetup,
  type Trip,
  type VehicleDraft,
} from '@/lib/rideService';
import {
  isTripInActiveMunicipality,
  municipalityAfterDecision,
  sortTripsForDriver,
  type Municipality,
  type MunicipalityDecision,
} from '@/lib/municipality';

const emptyVehicle: VehicleDraft = { make: '', model: '', year: '', color: '', licensePlate: '' };

export function useDriverHome(userId: string | undefined, onSessionExpired: () => void) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [setup, setSetup] = useState<DriverSetup | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [ratingAverage, setRatingAverage] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [error, setError] = useState('');
  const [vehicle, setVehicle] = useState<VehicleDraft>(emptyVehicle);
  const [completion, setCompletion] = useState<Trip | null>(null);
  const [decision, setDecision] = useState<{ base: string; destination: string } | null>(null);
  const refreshInFlight = useRef(false);

  const handleError = useCallback((message: string) => {
    if (isLikelySessionError(message)) {
      onSessionExpired();
      return;
    }
    setError(message);
  }, [onSessionExpired]);

  const refresh = useCallback(async () => {
    if (!userId || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const [setupResult, tripResult, openResult, municipalityResult, ratingResult] = await Promise.all([
        getDriverSetup(userId),
        getDriverActiveTrip(userId),
        getOpenTrips(),
        getMunicipalities(),
        getReceivedRatingAverage(userId),
      ]);
      if (setupResult.error) handleError(setupResult.error);
      if (tripResult.error) handleError(tripResult.error);
      if (openResult.error) handleError(openResult.error);
      if (municipalityResult.error) handleError(municipalityResult.error);
      if (ratingResult.error) handleError(ratingResult.error);
      setSetup(setupResult.data);
      setActiveTrip(tripResult.data?.status === 'completado' ? null : tripResult.data);
      setTrips(sortTripsForDriver(
        openResult.data ?? [],
        setupResult.data?.driver?.municipio_activo ?? setupResult.data?.driver?.municipio_base,
        setupResult.data?.driver
          ? { latitude: setupResult.data.driver.current_lat, longitude: setupResult.data.driver.current_lng }
          : { latitude: null, longitude: null },
      ));
      setMunicipalities(municipalityResult.data ?? []);
      setRatingAverage(ratingResult.data);
      setIsOnline(Boolean(setupResult.data?.driver?.is_online));
      if (setupResult.data?.driver && Number.isFinite(setupResult.data.driver.current_lat) && Number.isFinite(setupResult.data.driver.current_lng)) {
        setDriverLocation({
          latitude: Number(setupResult.data.driver.current_lat),
          longitude: Number(setupResult.data.driver.current_lng),
        });
      }
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [handleError, userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const unsubscribeTrips = subscribeToTrips(userId, 'driver', () => void refresh());
    const unsubscribeOpen = subscribeToOpenTrips(() => void refresh());
    return () => {
      unsubscribeTrips();
      unsubscribeOpen();
    };
  }, [refresh, userId]);

  const toggleOnline = useCallback(async (value: boolean) => {
    if (!userId) return;
    setActionLoading(true);
    const result = await setDriverAvailability(userId, value);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setIsOnline(value);
    void refresh();
  }, [handleError, refresh, userId]);

  const accept = useCallback(async (trip: Trip) => {
    if (!userId) return;
    setActionLoading(true);
    const result = await acceptTrip(trip.id, userId);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setActiveTrip(result.data);
    void refresh();
  }, [handleError, refresh, userId]);

  const updateStatus = useCallback(async (status: 'en_curso' | 'completado') => {
    if (!userId || !activeTrip) return;
    setActionLoading(true);
    const result = await updateTripStatus(activeTrip.id, userId, status);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    if (status === 'completado' && result.data) {
      const base = setup?.driver?.municipio_base;
      const destination = result.data.municipio_destino;
      if (base && destination && base !== destination) {
        setDecision({ base, destination });
      } else {
        setCompletion(result.data);
      }
      setActiveTrip(null);
    } else {
      setActiveTrip(result.data);
    }
    void refresh();
  }, [activeTrip, handleError, refresh, setup?.driver?.municipio_base, userId]);

  const saveVehicle = useCallback(async () => {
    if (!userId || !setup?.driver?.municipio_base) {
      setError('Primero selecciona tu municipio base.');
      return;
    }
    setActionLoading(true);
    const result = await saveDriverSetup(userId, vehicle, setup.driver.municipio_base);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setSetup(result.data);
    setVehicle(emptyVehicle);
    void refresh();
  }, [handleError, refresh, setup?.driver, userId, vehicle]);

  const chooseMunicipality = useCallback(async (value: MunicipalityDecision) => {
    if (!decision) return;
    setActionLoading(true);
    const nextMunicipality = municipalityAfterDecision(value, decision.base, decision.destination);
    const result = await setDriverActiveMunicipality(nextMunicipality);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setDecision(null);
    if (completion) setCompletion(completion);
    void refresh();
  }, [completion, decision, handleError, refresh]);

  return {
    loading,
    actionLoading,
    setup,
    trips,
    municipalities,
    activeTrip,
    driverLocation,
    ratingAverage,
    isOnline,
    error,
    vehicle,
    completion,
    decision,
    setVehicle,
    toggleOnline,
    accept,
    updateStatus,
    saveVehicle,
    chooseMunicipality,
    clearCompletion: () => setCompletion(null),
    retry: refresh,
    isTripInActiveMunicipality,
    updateLocation: async (location: DriverLocation) => {
      if (!userId) return;
      setDriverLocation(location);
      const result = await updateDriverLocation(userId, location);
      if (result.error) handleError(result.error);
    },
  };
}