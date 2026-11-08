import { supabase } from './supabase';
import type { GpsFix, TrackingSession } from './driverTracking';

export interface AssignedDriverPresence {
  driver_id: string;
  latitude: number | null;
  longitude: number | null;
  location_updated_at: string | null;
  is_online: boolean;
}

async function timedRequest<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function rpcError(error: { code?: string; message: string }) {
  return Object.assign(new Error(
    error.code === 'PGRST202' || error.code === '42883'
      ? 'GPS pendiente de activar: falta aplicar la migración de presencia en Supabase.'
      : error.message,
  ), { code: error.code });
}

export async function openDriverPresenceSession(): Promise<TrackingSession> {
  const result = await timedRequest((signal) => supabase.rpc('open_driver_presence_session').abortSignal(signal));
  if (result.error) throw rpcError(result.error);
  if (typeof result.data !== 'string') throw new Error('El servidor no devolvió una sesión GPS válida.');
  return { id: result.data, sequence: 0 };
}

export async function publishDriverPresence(fix: GpsFix | null, session: TrackingSession) {
  const sequence = ++session.sequence;
  if (!Number.isSafeInteger(sequence)) throw new Error('Reinicia la sesión GPS.');
  const result = await timedRequest((signal) => supabase.rpc('publish_driver_presence', {
    p_session_id: session.id,
    p_sequence: sequence,
    p_online: fix !== null,
    p_lat: fix?.latitude ?? null,
    p_lng: fix?.longitude ?? null,
    p_observed_at: fix ? new Date(fix.timestamp).toISOString() : null,
  }).abortSignal(signal));
  if (result.error) throw rpcError(result.error);
}

export async function loadAssignedDriverPresence(tripId: string): Promise<AssignedDriverPresence | null> {
  const result = await timedRequest((signal) => supabase.rpc('get_assigned_driver_location', { p_trip_id: tripId })
    .abortSignal(signal).maybeSingle());
  if (result.error) throw rpcError(result.error);
  return result.data as AssignedDriverPresence | null;
}
