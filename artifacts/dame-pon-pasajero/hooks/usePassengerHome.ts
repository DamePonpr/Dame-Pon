import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAssignedDriverPresence } from './useAssignedDriverPresence';
import type { LocationValue } from '@workspace/dame-pon-shared/types/type';
import {
  cancelTrip,
  getPassengerActiveTrip,
  getTripHistory,
  isLikelySessionError,
  isActiveTripStatus,
  rateTrip,
  requestTrip,
  subscribeToTrips,
  type Trip,
  type TripHistoryItem,
  type TripParticipantDetails,
  getTripParticipantDetails,
} from '@workspace/dame-pon-shared/lib/rideService';

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
  const presence = useAssignedDriverPresence(userId, activeTrip);
  const driverLocation = presence.location;
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
    try {
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
    } catch {
      setError('No pudimos leer tu ubicación. Revisa el GPS y los permisos; la consulta de tu conductor seguirá reintentando.');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setError('');
    try {
      const [tripResult, historyResult] = await Promise.all([
        getPassengerActiveTrip(userId),
        getTripHistory(userId, 'pasajero'),
      ]);
      if (tripResult.error) handleError(tripResult.error);
      if (historyResult.error) handleError(historyResult.error);
       const activeTrip = tripResult.data && isActiveTripStatus(tripResult.data.status)
         ? tripResult.data
         : null;
       setActiveTrip(activeTrip);
      setHistory(historyResult.data ?? []);
       if (activeTrip?.driver_id) {
         const details = await getTripParticipantDetails(activeTrip.id);
        setParticipantDetails(details.data);
      } else {
        setParticipantDetails(null);
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
    const unsubscribe = subscribeToTrips(userId, 'pasajero', () => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadPickup, refresh, userId]);


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
    driverPresence: presence,
    error,
    completion,
    selectDestination,
    cancel,
    rate,
    clearCompletion: () => setCompletion(null),
    retry: refresh,
  };
}