// No device/network imports: the production adapters and tests use the same lifecycle.
export interface GpsFix {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
}
export type TrackingState = 'offline' | 'starting' | 'tracking' | 'paused'
  | 'permission_denied' | 'services_disabled' | 'disconnected' | 'error';
export interface TrackingSnapshot {
  enabled: boolean;
  state: TrackingState;
  message: string;
  lastPublishedAt: number | null;
  location: GpsFix | null;
}
export const GPS_MIN_WRITE_MS = 10_000;
export const GPS_HEARTBEAT_MS = 25_000;
export const GPS_STALE_MS = 45_000;

export function assignedTripScope(userId: string | undefined, trip: {
  id: string; passenger_id: string; driver_id: string | null; status: string;
} | null) {
  if (!userId || !trip || trip.passenger_id !== userId || !trip.driver_id
    || !['accepted', 'arrived', 'in_progress'].includes(trip.status)) return null;
  return { tripId: trip.id, driverId: trip.driver_id, key: `${userId}:${trip.id}:${trip.driver_id}` };
}

export function validGpsFix(fix: GpsFix, now: number) {
  return Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90
    && Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180
    && Number.isFinite(fix.timestamp) && now - fix.timestamp <= 20_000
    && fix.timestamp <= now + 10_000
    && (fix.accuracy === null || (Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 100));
}

export function shouldPublishGps(previous: GpsFix | null, next: GpsFix, lastWrite: number | null, now: number) {
  if (!validGpsFix(next, now)) return false;
  if (lastWrite === null || !previous) return true;
  const elapsed = now - lastWrite;
  if (elapsed < GPS_MIN_WRITE_MS) return false;
  const dy = (next.latitude - previous.latitude) * 111_320;
  const dx = (next.longitude - previous.longitude) * 111_320 * Math.cos(next.latitude * Math.PI / 180);
  return elapsed >= GPS_HEARTBEAT_MS || Math.hypot(dx, dy) >= 15;
}

export function locationFreshness(updatedAt: string | null | undefined, online: boolean, connected: boolean, now: number) {
  if (!connected) return 'disconnected' as const;
  if (!online) return 'offline' as const;
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now + 10_000 || now - timestamp > GPS_STALE_MS) return 'stale' as const;
  return 'fresh' as const;
}

interface TrackingAdapters {
  now: () => number;
  permission: (request: boolean) => Promise<boolean>;
  servicesEnabled: () => Promise<boolean>;
  getFix: () => Promise<GpsFix>;
  watch: (onFix: (fix: GpsFix) => void, onError: (message: string) => void) => Promise<{ remove: () => void }>;
  publish: (fix: GpsFix | null, start: boolean) => Promise<void>;
  onChange: (snapshot: TrackingSnapshot) => void;
}

export function createDriverTracker(io: TrackingAdapters) {
  let generation = 0;
  let enabled = false;
  let subscription: { remove: () => void } | null = null;
  let latest: GpsFix | null = null;
  let sent: GpsFix | null = null;
  let lastWrite: number | null = null;
  let busy = false;
  let checking = false;
  let retryAt = 0;
  let failures = 0;
  let offlineConfirmed = false;
  let writes: Promise<void> = Promise.resolve();
  let snapshot: TrackingSnapshot = { enabled: false, state: 'offline', message: 'GPS detenido.', lastPublishedAt: null, location: null };
  const emit = (state: TrackingState, message: string) => {
    snapshot = { enabled, state, message, lastPublishedAt: lastWrite, location: latest };
    io.onChange(snapshot);
  };
  const enqueue = (operation: () => Promise<void>) => {
    const task = writes.catch(() => {}).then(operation);
    writes = task.catch(() => {});
    return task;
  };

  const stop = async (state: TrackingState = 'offline', message = 'No disponible. GPS detenido.') => {
    ++generation;
    enabled = false;
    subscription?.remove();
    subscription = null;
    latest = null;
    sent = null;
    emit(state, message);
    // Serialized AFTER an already-sent online update, before logout removes credentials.
    try {
      await enqueue(async () => {
        if (offlineConfirmed) return;
        await io.publish(null, false);
        offlineConfirmed = true;
      });
    } catch (error) {
      emit(state, `${message} No pudimos confirmar la baja en el servidor; la ubicación caducará cuando esté activa la protección de frescura. ${error instanceof Error ? error.message : 'Sin conexión.'}`);
    }
  };

  const publishLatest = async (start = false) => {
    const version = generation;
    const fix = latest;
    if (!enabled || busy || !fix || io.now() < retryAt || !shouldPublishGps(sent, fix, lastWrite, io.now())) return;
    busy = true;
    try {
      await enqueue(async () => {
        if (version !== generation || !enabled) return;
        offlineConfirmed = false;
        await io.publish(fix, start);
        if (version !== generation || !enabled) return;
        sent = fix;
        lastWrite = io.now();
        failures = 0;
        retryAt = 0;
        emit('tracking', 'GPS conectado. Compartiendo ubicación en primer plano.');
      });
    } catch (error) {
      if (version !== generation) return;
      if (!start && error && typeof error === 'object' && 'code' in error && error.code === '42501') {
        await stop('error', 'El servidor retiró tu disponibilidad. Revisa tu aprobación y vuelve a activar Disponible.');
        return;
      }
      failures++;
      retryAt = io.now() + Math.min(30_000, failures * 10_000);
      emit('disconnected', `Sin conexión con el servidor. Reintentando sin acumular ubicaciones. ${error instanceof Error ? error.message : ''}`);
      if (start) throw error;
    } finally {
      busy = false;
    }
  };

  const start = async () => {
    if (enabled) return;
    const version = ++generation;
    enabled = true;
    latest = null;
    sent = null;
    lastWrite = null;
    retryAt = 0;
    emit('starting', 'Solicitando permiso y una ubicación GPS precisa…');
    try {
      const permitted = await io.permission(true);
      if (version !== generation) return;
      if (!permitted) return await stop('permission_denied', 'Permiso de ubicación denegado. Permítelo en Ajustes y vuelve a activar Disponible.');
      const services = await io.servicesEnabled();
      if (version !== generation) return;
      if (!services) return await stop('services_disabled', 'La ubicación del teléfono está desactivada. Actívala y vuelve a intentarlo.');
      const fix = await io.getFix();
      if (version !== generation) return;
      if (!validGpsFix(fix, io.now())) throw new Error('No hay una lectura GPS reciente con precisión de 100 m o mejor.');
      latest = fix;
      await writes;
      if (version !== generation) return;
      await publishLatest(true);
      if (version !== generation) return;
      const watcher = await io.watch((value) => {
        if (version !== generation || !validGpsFix(value, io.now())) return;
        latest = value;
        void publishLatest();
      }, (message) => {
        if (version === generation) void stop('error', `GPS interrumpido: ${message}`);
      });
      if (version !== generation) watcher.remove();
      else subscription = watcher;
    } catch (error) {
      if (version === generation) await stop('error', error instanceof Error ? error.message : 'No pudimos iniciar el GPS.');
    }
  };

  const tick = async () => {
    if (!enabled || checking) return;
    checking = true;
    const version = generation;
    try {
      const permitted = await io.permission(false);
      if (version !== generation) return;
      if (!permitted) return await stop('permission_denied', 'Se retiró el permiso de ubicación. GPS detenido.');
      const services = await io.servicesEnabled();
      if (version !== generation) return;
      if (!services) return await stop('services_disabled', 'La ubicación del teléfono se desactivó. GPS detenido.');
      if (!latest || io.now() - latest.timestamp >= 15_000) {
        const fix = await io.getFix();
        if (version !== generation) return;
        if (!validGpsFix(fix, io.now())) throw new Error('Ubicación GPS antigua o imprecisa.');
        latest = fix;
      }
      await publishLatest();
      if (version === generation && lastWrite !== null && io.now() - lastWrite > GPS_STALE_MS) {
        emit('disconnected', 'Sin confirmación reciente del servidor. No puedes aceptar viajes hasta recuperar la conexión.');
      }
    } catch (error) {
      if (version === generation) await stop('error', error instanceof Error ? error.message : 'GPS interrumpido.');
    } finally {
      checking = false;
    }
  };
  return { start, stop, tick, getSnapshot: () => snapshot };
}
