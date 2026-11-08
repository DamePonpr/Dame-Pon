import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';
import { createDriverTracker, GPS_STALE_MS, type GpsFix, type TrackingSnapshot } from '@workspace/dame-pon-shared/lib/driverTracking';
import { openDriverPresenceSession, publishDriverPresence } from '@workspace/dame-pon-shared/lib/presenceService';
import { supabase } from '@workspace/dame-pon-shared/lib/supabase';

const initial: TrackingSnapshot = { enabled: false, state: 'offline', message: 'No disponible. Activa Disponible para compartir GPS.', location: null, lastPublishedAt: null };
interface PresenceValue {
  snapshot: TrackingSnapshot;
  online: boolean;
  toggle: (enabled: boolean) => Promise<void>;
}
const PresenceContext = createContext<PresenceValue | null>(null);

function fixFromLocation(value: Location.LocationObject): GpsFix {
  return {
    latitude: value.coords.latitude, longitude: value.coords.longitude,
    timestamp: value.timestamp, accuracy: value.coords.accuracy,
  };
}

async function currentFix(): Promise<GpsFix> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('El GPS no respondió en 15 segundos. Intenta al aire libre.')), 15_000); }),
    ]);
    return fixFromLocation(value);
  } finally {
    clearTimeout(timer);
  }
}

export function DriverPresenceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(initial);
  const trackerRef = useRef<ReturnType<typeof createDriverTracker> | null>(null);
  const [clock, setClock] = useState(Date.now());
  const userId = !auth.isLoading && auth.profile?.role === 'conductor'
    && auth.profile.id === auth.user?.id ? auth.user.id : null;

  useEffect(() => {
    if (!userId) {
      setSnapshot(initial);
      return;
    }
    let mounted = true;
    const tracker = createDriverTracker({
      now: Date.now,
      permission: async (request) => {
        const permission = request
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        return permission.granted;
      },
      servicesEnabled: () => Location.hasServicesEnabledAsync(),
      getFix: currentFix,
      openSession: async () => {
        const current = await supabase.auth.getSession();
        if (current.data.session?.user.id !== userId) throw new Error('La sesión de conductor cambió.');
        return openDriverPresenceSession();
      },
      watch: async (onFix, onError) => Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 0 },
        (value) => onFix(fixFromLocation(value)),
        onError,
      ),
      publish: async (fix, _start, session) => {
        const current = await supabase.auth.getSession();
        if (current.data.session?.user.id !== userId) {
          throw Object.assign(new Error('La sesión de conductor cambió; no se confirmó la presencia.'), { code: '42501' });
        }
        await publishDriverPresence(fix, session);
      },
      onChange: (next) => { if (mounted) setSnapshot(next); },
    });
    trackerRef.current = tracker;
    // Local reset only: without an allocated token, do not alter a legacy
    // driver's availability or stop a different device's presence.
    const reset = tracker.stop();
    const unsubscribeLogout = auth.registerBeforeSignOut(() => tracker.stop());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') void tracker.stop('paused', 'GPS pausado al salir de la app. Al volver, activa Disponible de nuevo.');
    });
    const timer = setInterval(() => {
      setClock(Date.now());
      if (AppState.currentState === 'active') void tracker.tick();
    }, 5_000);
    void reset;
    return () => {
      mounted = false;
      trackerRef.current = null;
      clearInterval(timer);
      appState.remove();
      unsubscribeLogout();
      void tracker.stop();
    };
  }, [userId, auth.registerBeforeSignOut]);

  const online = snapshot.state === 'tracking' && snapshot.lastPublishedAt !== null
    && clock - snapshot.lastPublishedAt <= GPS_STALE_MS;
  return (
    <PresenceContext.Provider value={{
      snapshot, online,
      toggle: async (enabled) => {
        if (!trackerRef.current || AppState.currentState !== 'active') return;
        if (enabled) await trackerRef.current.start();
        else await trackerRef.current.stop();
      },
    }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useDriverPresence() {
  const presence = useContext(PresenceContext);
  if (!presence) throw new Error('Falta DriverPresenceProvider.');
  return presence;
}
