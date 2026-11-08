import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { loadAssignedDriverPresence, type AssignedDriverPresence } from '@workspace/dame-pon-shared/lib/presenceService';
import { assignedTripScope, locationFreshness } from '@workspace/dame-pon-shared/lib/driverTracking';
import { subscribeToDriverLocation, type Trip } from '@workspace/dame-pon-shared/lib/rideService';

export function useAssignedDriverPresence(userId: string | undefined, trip: Trip | null) {
  const [record, setRecord] = useState<AssignedDriverPresence | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const assignment = assignedTripScope(userId, trip);
  const tripId = assignment?.tripId;
  const driverId = assignment?.driverId;
  // Include the scope in the state: a render immediately after a trip/account
  // switch must not expose the preceding trip's coordinates, even before effects.
  const scope = assignment?.key ?? `${userId ?? ''}:unassigned`;
  const [loadedScope, setLoadedScope] = useState('');
  useEffect(() => {
    let active = true;
    let inFlight = false;
    setRecord(null);
    setConnected(false);
    setLoadedScope(scope);
    if (!tripId || !driverId) return;
    const refresh = async () => {
      if (inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        const next = await loadAssignedDriverPresence(tripId);
        if (!active) return;
        setRecord(next?.driver_id === driverId ? next : null);
        setConnected(true);
        setClock(Date.now());
      } catch {
        if (active) setConnected(false);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    // This subscription already reconciles through REST every 10 s if Realtime is silent.
    const unsubscribe = subscribeToDriverLocation(driverId, () => void refresh());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const timer = setInterval(() => setClock(Date.now()), 5_000);
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
      appState.remove();
    };
  }, [scope, tripId, driverId]);

  const current = loadedScope === scope && tripId && driverId ? record : null;
  const freshness = locationFreshness(current?.location_updated_at, Boolean(current?.is_online), connected && loadedScope === scope, clock);
  const coordinates = current && Number.isFinite(current.latitude) && Number.isFinite(current.longitude)
    && Math.abs(current.latitude!) <= 90 && Math.abs(current.longitude!) <= 180;
  const location = freshness === 'fresh' && coordinates
    ? { latitude: current.latitude!, longitude: current.longitude! }
    : null;
  const label = freshness === 'fresh' ? 'GPS del conductor conectado'
    : freshness === 'stale' ? 'Ubicación del conductor obsoleta; esperando una lectura reciente'
      : freshness === 'offline' ? 'El conductor no está compartiendo ubicación'
        : 'Sin conexión con la ubicación del conductor; reintentando';
  return { location, freshness, label, updatedAt: current?.location_updated_at ?? null };
}
