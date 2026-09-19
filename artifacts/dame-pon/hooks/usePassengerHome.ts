import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { LocationValue } from '@/types/type';
import {
  cancelTrip,
  getDriverLocation,
  getPassengerActiveTrip,
  getTripHistory,
  isLikelySessionError,
  rateTrip,
  requestTrip,
  subscribeToDriverLocation,
  subscribeToTrips,
  type DriverLocation,
  type Trip,
  type TripHistoryItem,
  type TripParticipantDetails,
  getTripParticipantDetails,
} from '@/lib/rideService';

interface CompletionState {
  trip: Trip;
  score: number;
  participantDetails: TripParticipantDetails | null;
}

export function usePassengerHome(userId: string | undefined, onSessionExpired: () => void) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [history, setHistory] = useState<TripHistoryItem[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [participantDetails, setParticipantDetails] = useState<TripParticipantDetails | null>(null);
  const [pickup, setPickup] = useState<LocationValue | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState('');
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const refreshInFlight = useRef(false);

  const handleError = useCallback((message: string) => {
    if (isLikelySessionError(message)) {
      onSessionExpired();
      return;
    }
    setError(message);
  }, [onSessionExpired]);

  const loadPickup = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Activa tu ubicación para mostrar el mapa y pedir un Pon.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let address = 'Tu ubicación actual';
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      const place = places[0];
      address = [place?.name, place?.city, place?.region].filter(Boolean).join(', ') || address;
    } catch {
      // Coordinates are enough to request a trip.
    }
    setPickup({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      address,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setError('');
    try {
      const [tripResult, historyResult] = await Promise.all([
        getPassengerActiveTrip(userId),
        getTripHistory(userId, 'passenger'),
      ]);
      if (tripResult.error) handleError(tripResult.error);
      if (historyResult.error) handleError(historyResult.error);
      setActiveTrip(tripResult.data);
      setHistory(historyResult.data ?? []);
      if (tripResult.data?.driver_id) {
        const details = await getTripParticipantDetails(tripResult.data.id);
        setParticipantDetails(details.data);
        const location = await getDriverLocation(tripResult.data.driver_id);
        if (location.error) handleError(location.error);
        setDriverLocation(location.data);
      } else {
        setParticipantDetails(null);
        setDriverLocation(null);
      }
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [handleError, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadPickup(), refresh()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const unsubscribe = subscribeToTrips(userId, 'passenger', () => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadPickup, refresh, userId]);

  useEffect(() => {
    if (!activeTrip?.driver_id) return;
    const unsubscribe = subscribeToDriverLocation(activeTrip.driver_id, () => {
      void getDriverLocation(activeTrip.driver_id!).then((result) => {
        if (result.error) handleError(result.error);
        setDriverLocation(result.data);
      });
    });
    return unsubscribe;
  }, [activeTrip?.driver_id, handleError]);

  const selectDestination = useCallback(async (destination: LocationValue) => {
    if (!userId) return;
    if (!pickup) {
      setError('Necesitamos tu ubicación antes de solicitar el viaje.');
      return;
    }
    setActionLoading(true);
    setError('');
    const result = await requestTrip(
      userId,
      destination.address,
      { address: pickup.address, latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    );
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setActiveTrip(result.data);
  }, [handleError, pickup, userId]);

  const cancel = useCallback(async () => {
    if (!userId || !activeTrip) return;
    setActionLoading(true);
    const result = await cancelTrip(activeTrip.id, userId);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    setActiveTrip(null);
    void refresh();
  }, [activeTrip, handleError, refresh, userId]);

  const rate = useCallback(async (score: number) => {
    if (!userId || !activeTrip) return;
    setActionLoading(true);
    const result = await rateTrip(activeTrip, userId, score);
    setActionLoading(false);
    if (result.error) {
      handleError(result.error);
      return;
    }
    const details = await getTripParticipantDetails(activeTrip.id);
    setCompletion({ trip: activeTrip, score, participantDetails: details.data ?? participantDetails });
    setActiveTrip(null);
    void refresh();
  }, [activeTrip, handleError, participantDetails, refresh, userId]);

  return {
    loading,
    actionLoading,
    history,
    activeTrip,
    participantDetails,
    pickup,
    driverLocation,
    error,
    completion,
    selectDestination,
    cancel,
    rate,
    clearCompletion: () => setCompletion(null),
    retry: refresh,
  };
}