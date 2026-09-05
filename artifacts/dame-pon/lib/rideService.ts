import { supabase } from '@/lib/supabase';

export type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  status: string;
  passenger_id?: string | null;
  driver_id?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  origin?: string | null;
  destination?: string | null;
  created_at?: string | null;
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
  destination: string,
  pickupLocation = 'Ubicación actual',
): Promise<ServiceResult<Trip>> {
  const payloads: Record<string, unknown>[] = [
    {
      passenger_id: passengerId,
      pickup_location: pickupLocation,
      dropoff_location: destination.trim(),
      status: 'requested',
    },
    {
      rider_id: passengerId,
      origin: pickupLocation,
      destination: destination.trim(),
      status: 'requested',
    },
  ];

  let lastError: string | null = null;
  for (const payload of payloads) {
    const result = await supabase.from('trips').insert(payload).select().single();
    if (!result.error) {
      return { data: result.data as Trip, error: null };
    }
    lastError = result.error.message;
    if (!isColumnMismatch(result.error.message)) break;
  }

  console.error('[Dame Pon] Error creando trip:', lastError);
  return { data: null, error: lastError ?? 'No pudimos solicitar el viaje.' };
}

export async function getPassengerActiveTrip(passengerId: string): Promise<ServiceResult<Trip>> {
  let result = await supabase
    .from('trips')
    .select('*')
    .eq('passenger_id', passengerId)
    .in('status', ['requested', 'accepted', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error && isColumnMismatch(result.error.message)) {
    result = await supabase
      .from('trips')
      .select('*')
      .eq('rider_id', passengerId)
      .in('status', ['requested', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (result.error && !isColumnMismatch(result.error.message)) {
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: (result.data as Trip | null) ?? null, error: null };
}

export async function getOpenTrips(): Promise<ServiceResult<Trip[]>> {
  const result = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'requested')
    .order('created_at', { ascending: false })
    .limit(10);

  if (result.error) {
    return { data: null, error: getErrorMessage(result.error) };
  }
  return { data: (result.data as Trip[]) ?? [], error: null };
}

export async function acceptTrip(tripId: string, driverId: string): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .from('trips')
    .update({ driver_id: driverId, status: 'accepted' })
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
  return trip.dropoff_location ?? trip.destination ?? 'Destino sin especificar';
}
