import { supabase } from './supabase';
import type { GpsFix } from './driverTracking';

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

export async function publishDriverPresence(fix: GpsFix | null, start = false) {
  const result = await timedRequest((signal) => supabase.rpc('publish_driver_presence', {
    p_online: fix !== null,
    p_start: start,
    p_lat: fix?.latitude ?? null,
    p_lng: fix?.longitude ?? null,
    p_observed_at: fix ? new Date(fix.timestamp).toISOString() : null,
  }).abortSignal(signal));
  if (result.error) throw Object.assign(new Error(
    result.error.code === 'PGRST202' || result.error.code === '42883'
      ? 'GPS pendiente de activar: falta aplicar la migración de presencia en Supabase.'
      : result.error.message,
  ), { code: result.error.code });
}

export async function loadAssignedDriverPresence(tripId: string): Promise<AssignedDriverPresence | null> {
  const result = await timedRequest((signal) => supabase.rpc('get_assigned_driver_location', { p_trip_id: tripId })
    .abortSignal(signal).maybeSingle());
  if (result.error) throw new Error(result.error.message);
  return result.data as AssignedDriverPresence | null;
}
