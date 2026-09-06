import { supabase } from '@/lib/supabase';

export type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  status: string;
  passenger_id?: string | null;
  driver_id?: string | null;
  pickup_address?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_address?: string | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  fare_estimate?: number | null;
  fare_final?: number | null;
  distance_km?: number | null;
  requested_at?: string | null;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface VehicleDraft {
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
}

export interface DriverSetup {
  driver: Record<string, unknown> | null;
  vehicle: Record<string, unknown> | null;
}

interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

function getErrorMessage(error: { message?: string } | null) {
  return error?.message || 'No pudimos completar esta acción.';
}

function isColumnMismatch(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('column') || normalized.includes('schema cache') || normalized.includes('does not exist');
}

export async function getDriverSetup(userId: string): Promise<ServiceResult<DriverSetup>> {
  const driverResult = await supabase.from('drivers').select('*').eq('id', userId).maybeSingle();
  const driver = driverResult.data as Record<string, unknown> | null;

  if (driverResult.error && !isColumnMismatch(driverResult.error.message)) {
    return { data: null, error: getErrorMessage(driverResult.error) };
  }

  const driverId = typeof driver?.id === 'string' ? driver.id : userId;
  let vehicleResult = await supabase.from('vehicles').select('*').eq('driver_id', driverId).maybeSingle();
  if (vehicleResult.error && isColumnMismatch(vehicleResult.error.message)) {
    vehicleResult = await supabase.from('vehicles').select('*').eq('user_id', userId).maybeSingle();
  }

  if (vehicleResult.error && !isColumnMismatch(vehicleResult.error.message)) {
    return { data: null, error: getErrorMessage(vehicleResult.error) };
  }

  return {
    data: { driver, vehicle: vehicleResult.data as Record<string, unknown> | null },
    error: null,
  };
}

export async function saveDriverSetup(
  userId: string,
  draft: VehicleDraft,
): Promise<ServiceResult<DriverSetup>> {
  const driverPayloads: Record<string, unknown>[] = [
    { id: userId, is_available: false },
    { profile_id: userId, is_available: false },
    { user_id: userId, is_available: false },
  ];

  let driver: Record<string, unknown> | null = null;
  let lastDriverError: string | null = null;

  for (const payload of driverPayloads) {
    const result = await supabase.from('drivers').upsert(payload, { onConflict: 'id' }).select().maybeSingle();
    if (!result.error) {
      driver = result.data as Record<string, unknown> | null;
      break;
    }
    lastDriverError = result.error.message;
    if (!isColumnMismatch(result.error.message)) break;
  }

  if (!driver && lastDriverError) {
    console.error('[Dame Pon] Error guardando drivers:', lastDriverError);
    return { data: null, error: lastDriverError };
  }

  const driverId = typeof driver?.id === 'string' ? driver.id : userId;
  const vehiclePayloads: Record<string, unknown>[] = [
    {
      driver_id: driverId,
      make: draft.make.trim(),
      model: draft.model.trim(),
      year: Number(draft.year),
      color: draft.color.trim(),
      license_plate: draft.licensePlate.trim().toUpperCase(),
    },
    {
      user_id: userId,
      brand: draft.make.trim(),
      model: draft.model.trim(),
      year: Number(draft.year),
      color: draft.color.trim(),
      plate_number: draft.licensePlate.trim().toUpperCase(),
    },
  ];

  let vehicle: Record<string, unknown> | null = null;
  let lastVehicleError: string | null = null;

  for (const payload of vehiclePayloads) {
    const result = await supabase.from('vehicles').insert(payload).select().maybeSingle();
    if (!result.error) {
      vehicle = result.data as Record<string, unknown> | null;
      break;
    }
    lastVehicleError = result.error.message;
    if (!isColumnMismatch(result.error.message)) break;
  }

  if (!vehicle && lastVehicleError) {
    console.error('[Dame Pon] Error guardando vehicles:', lastVehicleError);
    return { data: null, error: lastVehicleError };
  }

  return { data: { driver, vehicle }, error: null };
}

export async function setDriverAvailability(
  userId: string,
  isAvailable: boolean,
): Promise<ServiceResult<boolean>> {
  let result = await supabase.from('drivers').update({ is_available: isAvailable }).eq('id', userId);
  if (result.error && isColumnMismatch(result.error.message)) {
    result = await supabase.from('drivers').update({ available: isAvailable }).eq('profile_id', userId);
  }
  if (result.error) {
    console.error('[Dame Pon] Error actualizando disponibilidad:', result.error.message);
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: true, error: null };
}

export async function requestTrip(
  passengerId: string,
  dropoffAddress: string,
  pickup: {
    address: string;
    latitude: number | null;
    longitude: number | null;
  },
): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .from('trips')
    .insert({
      passenger_id: passengerId,
      driver_id: null,
      pickup_address: pickup.address,
      pickup_lat: pickup.latitude,
      pickup_lng: pickup.longitude,
      dropoff_address: dropoffAddress.trim(),
      dropoff_lat: null,
      dropoff_lng: null,
      status: 'requested',
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (result.error) {
    console.error('[Dame Pon] Error creando trip:', result.error.message);
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: result.data as Trip, error: null };
}

export async function getPassengerActiveTrip(passengerId: string): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .from('trips')
    .select('*')
    .eq('passenger_id', passengerId)
    .in('status', ['requested', 'accepted', 'in_progress'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: (result.data as Trip | null) ?? null, error: null };
}

export async function getOpenTrips(): Promise<ServiceResult<Trip[]>> {
  const result = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'requested')
    .order('requested_at', { ascending: false })
    .limit(10);

  if (result.error) {
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: (result.data as Trip[]) ?? [], error: null };
}

export async function acceptTrip(tripId: string, driverId: string): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .from('trips')
    .update({
      driver_id: driverId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', tripId)
    .eq('status', 'requested')
    .select()
    .single();

  if (result.error) {
    console.error('[Dame Pon] Error aceptando trip:', result.error.message);
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: result.data as Trip, error: null };
}

export function tripDestination(trip: Trip) {
  return trip.dropoff_address ?? 'Destino sin especificar';
}
