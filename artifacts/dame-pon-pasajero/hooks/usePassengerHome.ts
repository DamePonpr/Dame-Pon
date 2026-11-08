import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAssignedDriverPresence } from './useAssignedDriverPresence';
import type { LocationValue } from '@workspace/dame-pon-shared/types/type';
import { isPuertoRicoPoint, routeMatches, type RoadRoute } from '@workspace/dame-pon-shared/lib/roadRouting';
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
  const [locationMessage,setLocationMessage] = useState('');
  const pickupGeneration=useRef(0);
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
    const version=++pickupGeneration.current;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
    setLocationMessage('Leyendo GPS para el origen… También puedes elegirlo manualmente.');
    const permission = await Location.requestForegroundPermissionsAsync();
    if(version!==pickupGeneration.current) return;
    if (permission.status !== 'granted') {
      setLocationMessage('Permiso de ubicación denegado. Puedes buscar y seleccionar un origen manual.');
      return;
    }
    if(!await Location.hasServicesEnabledAsync()) {
      if(version===pickupGeneration.current) setLocationMessage('GPS desactivado. Elige un origen manual o activa la ubicación.');
      return;
    }
    const current=await Promise.race([
      Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('slow')),10_000);}),
    ]);
    if(version!==pickupGeneration.current) return;
    if(!isPuertoRicoPoint(current.coords) || Date.now()-current.timestamp>30_000
      || current.timestamp>Date.now()+10_000 || !Number.isFinite(current.coords.accuracy)
      || current.coords.accuracy===null || current.coords.accuracy<0 || current.coords.accuracy>100) {
      setLocationMessage('No hay GPS preciso y reciente en Puerto Rico. Selecciona un origen manual.');
      return;
    }
    setPickup({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      address:'Ubicación GPS seleccionada',
    });
    setLocationMessage('Origen GPS. Confirma que corresponde al punto donde esperas.');
    clearTimeout(timer);
    try {
      // Existing Expo/OS reverse geocoder: optional label, never inferred route.
      const places=await Promise.race([
        Location.reverseGeocodeAsync({latitude:current.coords.latitude,longitude:current.coords.longitude}),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('label timeout')),3_000);}),
      ]);
      if(version!==pickupGeneration.current) return;
      const place=places[0];
      const address=[place?.name,place?.street,place?.city,place?.region].filter(Boolean).join(', ');
      if(address) setPickup({latitude:current.coords.latitude,longitude:current.coords.longitude,address});
    } catch { /* Keep the real GPS point if reverse geocoding is unavailable. */ }
    } catch(error) {
      if(version===pickupGeneration.current) setLocationMessage(error instanceof Error && error.message==='slow'
        ? 'El GPS tarda demasiado. Selecciona un origen manual o reintenta.'
        : 'No pudimos leer el GPS. Puedes seleccionar un origen manual.');
    } finally {clearTimeout(timer);}
  }, []);
  const choosePickup=useCallback((value:LocationValue|null)=>{
    ++pickupGeneration.current;
    setPickup(value);
    setLocationMessage(value ? 'Origen elegido. Confirma la dirección antes de solicitar.' : 'Selecciona una sugerencia para confirmar el origen.');
  },[]);

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
      ++pickupGeneration.current;
      unsubscribe();
    };
  }, [loadPickup, refresh, userId]);


  const requesting=useRef(false);
  const selectDestination = useCallback(async (destination: LocationValue, route:RoadRoute|null) => {
    if (!userId) return;
    if(activeTrip || requesting.current) return;
    if (!pickup || !isPuertoRicoPoint(pickup) || !isPuertoRicoPoint(destination)
      || !routeMatches(route,pickup,destination) || !route || Date.now()-route.calculatedAt>=5*60_000) {
      setError('Confirma origen, destino y una ruta reciente antes de solicitar el viaje.');
      return;
    }
    requesting.current=true;
    setActionLoading(true);
    setError('');
    try {
    const result = await requestTrip(
      userId,
      destination.address,
      { address: pickup.address, latitude: pickup.latitude, longitude: pickup.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    );
    if (result.error) {
      handleError(result.error);
      return;
    }
    setActiveTrip(result.data);
    } finally {requesting.current=false;setActionLoading(false);}
  }, [activeTrip,handleError, pickup, userId]);

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
    choosePickup,
    locationMessage,
    retryLocation:loadPickup,
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