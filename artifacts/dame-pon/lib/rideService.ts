import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/roles';
import type { Municipality } from '@/lib/municipality';
import {
  averageReceivedRating,
  findUnratedCompletedTrip,
  ratingSummaryForUser,
} from '@/lib/ratingLogic';

export type TripStatus = 'requested' | 'offered' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
export type DriverStatus = 'pendiente' | 'aprobado' | 'suspendido';

export interface Trip {
  id: string;
  status: TripStatus;
  passenger_id: string;
  driver_id: string | null;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  fare_estimate?: number | null;
  fare_final?: number | null;
  distance_km?: number | null;
  requested_at: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  municipio_origen: string | null;
  municipio_destino: string | null;
  arrived_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  payment_status?: string | null;
  passenger_pin?: string | null;
}

export interface TripHistoryItem {
  trip: Trip;
  sentRating: number | null;
  receivedRating: number | null;
}

export interface Driver {
  id: string;
  status: DriverStatus;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  updated_at: string;
  municipio_base: string | null;
  municipio_activo: string | null;
  municipios_activos: string[];
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
}

export interface Vehicle {
  id: string;
  driver_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
}

export interface VehicleDraft {
  make: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
}

export interface DriverSetup {
  driver: Driver | null;
  vehicle: Vehicle | null;
}

export interface TripParticipantDetails {
  trip_id: string;
  passenger_id: string;
  passenger_name: string | null;
  passenger_avatar_url: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_avatar_url: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  vehicle_plate: string | null;
}

interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
}

export function isLikelySessionError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('pgrst301')
    || normalized.includes('invalid jwt')
    || normalized.includes('jwt expired')
    || normalized.includes('código: 42501')
      && normalized.includes('permission denied');
}

type RideAction =
  | 'load-driver'
  | 'save-driver'
  | 'save-vehicle'
  | 'availability'
  | 'request-trip'
  | 'load-passenger-trip'
  | 'load-history'
  | 'load-open-trips'
  | 'load-driver-location'
  | 'update-driver-location'
  | 'load-rating'
  | 'accept-trip'
  | 'cancel-trip'
  | 'update-trip'
  | 'rate-trip'
  | 'load-municipalities'
  | 'set-driver-base'
  | 'set-driver-active'
  | 'load-participant-details';

const DRIVER_COLUMNS = 'id,status,is_online,current_lat,current_lng,updated_at,municipio_base,municipio_activo,municipios_activos';
const VEHICLE_COLUMNS = 'id,driver_id,make,model,year,color,plate';
const TRIP_COLUMNS = 'id,status,passenger_id,driver_id,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,fare_estimate,fare_final,distance_km,requested_at,accepted_at,started_at,completed_at,municipio,allow_cross_municipio,municipio_origen,municipio_destino,arrived_at,cancelled_at,cancelled_by,cancel_reason,payment_status';
const PASSENGER_TRIP_COLUMNS = `${TRIP_COLUMNS},passenger_pin`;

const TRIP_RECONCILIATION_INTERVAL_MS = 3_000;
const actionFallbacks: Record<RideAction, string> = {
  'load-driver': 'No pudimos cargar tu información de conductor.',
  'save-driver': 'No pudimos preparar tu perfil de conductor.',
  'save-vehicle': 'No pudimos guardar los datos del vehículo.',
  availability: 'No pudimos actualizar tu disponibilidad.',
  'request-trip': 'No pudimos solicitar el viaje.',
  'load-passenger-trip': 'No pudimos cargar tu viaje activo.',
  'load-history': 'No pudimos cargar tu historial de viajes.',
  'load-open-trips': 'No pudimos cargar las solicitudes disponibles.',
  'load-driver-location': 'No pudimos cargar la ubicación del conductor.',
  'update-driver-location': 'No pudimos compartir tu ubicación con el pasajero.',
  'load-rating': 'No pudimos comprobar si este viaje ya fue calificado.',
  'accept-trip': 'No pudimos aceptar este viaje.',
  'cancel-trip': 'No pudimos cancelar este viaje.',
  'update-trip': 'No pudimos actualizar el estado del viaje.',
  'rate-trip': 'No pudimos guardar tu calificación.',
  'load-municipalities': 'No pudimos cargar la lista de municipios.',
  'set-driver-base': 'No pudimos guardar tu municipio base.',
  'set-driver-active': 'No pudimos cambiar tu municipio activo.',
  'load-participant-details': 'No pudimos cargar los datos visibles de los participantes.',
};

function logServiceError(action: RideAction, error: SupabaseErrorLike) {
  console.error(`[Dame Pon] ${action}:`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    status: error.status,
  });
}

function toUserMessage(error: SupabaseErrorLike, action: RideAction) {
  const code = error.code?.toUpperCase() ?? '';
  const message = error.message?.toLowerCase() ?? '';
  const details = error.details?.toLowerCase() ?? '';
  const combined = `${message} ${details}`;

  if (
    error.status === 401
    || combined.includes('invalid api key')
    || combined.includes('invalid jwt')
    || combined.includes('jwt expired')
  ) {
    return 'La conexión con Supabase necesita una clave pública válida. Actualiza la configuración del proyecto e inténtalo de nuevo.';
  }

  if (
    code === '42501'
    || code === 'PGRST301'
    || combined.includes('row-level security')
    || combined.includes('permission denied')
    || combined.includes('not authorized')
  ) {
    return 'Supabase bloqueó esta acción por permisos. Revisa las políticas RLS para el usuario autenticado.';
  }

  if (
    code === '42703'
    || code === '42P01'
    || code === 'PGRST204'
    || combined.includes('schema cache')
    || combined.includes('column') && combined.includes('does not exist')
    || combined.includes('relation') && combined.includes('does not exist')
  ) {
    return 'El esquema de Supabase no coincide con el esperado. Revisa drivers.is_online, vehicles.plate y las direcciones de trips.';
  }

  if (code === '23505' || combined.includes('duplicate key')) {
    if (action === 'save-vehicle') {
      return 'Ya existe un vehículo con esos datos. Revisa la matrícula e inténtalo de nuevo.';
    }
    return 'Este registro ya existe y no se puede duplicar.';
  }

  if (code === '23503' || combined.includes('foreign key')) {
    return 'Falta un registro relacionado en Supabase. Cierra sesión, vuelve a entrar e inténtalo de nuevo.';
  }

  return actionFallbacks[action];
}

function supabaseDiagnostic(error: SupabaseErrorLike) {
  const lines = [
    `Código: ${error.code ?? 'no informado'}`,
    `Mensaje: ${error.message ?? 'no informado'}`,
  ];
  if (error.details) lines.push(`Detalles: ${error.details}`);
  if (error.status) lines.push(`HTTP: ${error.status}`);
  return lines.join('\n');
}

function serviceError<T>(action: RideAction, error: SupabaseErrorLike): ServiceResult<T> {
  logServiceError(action, error);
  return {
    data: null,
    error: `${toUserMessage(error, action)}\n\nDiagnóstico real de Supabase:\n${supabaseDiagnostic(error)}`,
  };
}

export async function getDriverSetup(userId: string): Promise<ServiceResult<DriverSetup>> {
  const driverResult = await supabase
    .from('drivers')
    .select(DRIVER_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (driverResult.error) {
    return serviceError('load-driver', driverResult.error);
  }

  const vehicleResult = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('driver_id', userId)
    .maybeSingle();

  if (vehicleResult.error) {
    return serviceError('load-driver', vehicleResult.error);
  }

  return {
    data: {
      driver: driverResult.data as Driver | null,
      vehicle: vehicleResult.data as Vehicle | null,
    },
    error: null,
  };
}

export async function getReceivedRatingAverage(userId: string): Promise<ServiceResult<number>> {
  const result = await supabase
    .from('ratings')
    .select('trip_id,rated_by,rated_user,score')
    .eq('rated_user', userId);

  if (result.error) {
    return serviceError('load-rating', result.error);
  }

  const ratings = (result.data ?? []) as Array<{
    trip_id: string;
    rated_by: string;
    rated_user: string;
    score: number;
  }>;
  return { data: averageReceivedRating(ratings, userId), error: null };
}

export async function getMunicipalities(): Promise<ServiceResult<Municipality[]>> {
  const result = await supabase
    .from('municipios')
    .select('id,nombre,centro_lat,centro_lng')
    .order('nombre', { ascending: true });

  if (result.error) {
    return serviceError('load-municipalities', result.error);
  }
  return { data: (result.data as Municipality[]) ?? [], error: null };
}

export async function saveDriverSetup(
  userId: string,
  draft: VehicleDraft,
  baseMunicipality: string,
): Promise<ServiceResult<DriverSetup>> {
  const existingDriver = await supabase
    .from('drivers')
    .select(DRIVER_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (existingDriver.error) {
    return serviceError('save-driver', existingDriver.error);
  }

  let driverResult = existingDriver.data
    ? existingDriver
    : await supabase
        .from('drivers')
        .insert({
          id: userId,
          license_number: draft.licensePlate.trim().toUpperCase(),
          municipio_base: baseMunicipality,
          is_online: false,
        })
        .select(DRIVER_COLUMNS)
        .single();

  if (driverResult.data && !driverResult.data.municipio_base) {
    const baseResult = await supabase
      .rpc('set_driver_base_municipio', { p_municipio: baseMunicipality })
      .maybeSingle();
    if (baseResult.error) return serviceError('set-driver-base', baseResult.error);
    if (baseResult.data) {
      driverResult = {
        ...driverResult,
        data: baseResult.data as Driver,
      };
    }
  }

  if (driverResult.error || !driverResult.data) {
    return serviceError(
      'save-driver',
      driverResult.error ?? { message: 'No se pudo crear el perfil de conductor.' },
    );
  }

  const vehiclePayload = {
    driver_id: userId,
    make: draft.make.trim(),
    model: draft.model.trim(),
    year: Number(draft.year),
    color: draft.color.trim(),
    plate: draft.licensePlate.trim().toUpperCase(),
  };

  const existingVehicle = await supabase
    .from('vehicles')
    .select('id')
    .eq('driver_id', userId)
    .maybeSingle();

  if (existingVehicle.error) {
    return serviceError('save-vehicle', existingVehicle.error);
  }

  const vehicleResult = existingVehicle.data?.id
    ? await supabase
        .from('vehicles')
        .update(vehiclePayload)
        .eq('id', existingVehicle.data.id)
        .select(VEHICLE_COLUMNS)
        .single()
    : await supabase
        .from('vehicles')
        .insert(vehiclePayload)
        .select(VEHICLE_COLUMNS)
        .single();

  if (vehicleResult.error) {
    return serviceError('save-vehicle', vehicleResult.error);
  }

  return {
    data: {
       driver: driverResult.data as Driver,
      vehicle: vehicleResult.data as Vehicle,
    },
    error: null,
  };
}

export async function setDriverActiveMunicipality(
  municipality: string,
): Promise<ServiceResult<Driver>> {
  const result = await supabase
    .rpc('set_driver_active_municipio', { p_municipio: municipality })
    .maybeSingle();

  if (result.error) {
    return serviceError('set-driver-active', result.error);
  }
  if (!result.data) {
    return { data: null, error: 'No encontramos tu perfil de conductor.' };
  }
  return { data: result.data as Driver, error: null };
}

export async function setDriverBaseMunicipality(
  municipality: string,
): Promise<ServiceResult<Driver>> {
  const result = await supabase
    .rpc('set_driver_base_municipio', { p_municipio: municipality })
    .maybeSingle();

  if (result.error) {
    return serviceError('set-driver-base', result.error);
  }
  if (!result.data) {
    return { data: null, error: 'El municipio base ya fue establecido o no encontramos tu perfil de conductor.' };
  }
  return { data: result.data as Driver, error: null };
}

export async function setDriverAvailability(
  userId: string,
  isAvailable: boolean,
): Promise<ServiceResult<boolean>> {
  const result = await supabase
    .from('drivers')
    .update({ is_online: isAvailable })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (result.error) {
    return serviceError('availability', result.error);
  }

  if (!result.data) {
    return {
      data: null,
      error: 'No encontramos tu perfil de conductor. Guarda primero los datos de tu vehículo.',
    };
  }

  return { data: true, error: null };
}

export async function getDriverLocation(driverId: string): Promise<ServiceResult<DriverLocation>> {
  const result = await supabase
    .from('drivers')
    .select('current_lat,current_lng')
    .eq('id', driverId)
    .maybeSingle();

  if (result.error) {
    return serviceError('load-driver-location', result.error);
  }

  const latitude = result.data?.current_lat;
  const longitude = result.data?.current_lng;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { data: null, error: null };
  }

  return {
    data: { latitude: Number(latitude), longitude: Number(longitude) },
    error: null,
  };
}

export async function getTripParticipantDetails(
  tripId: string,
): Promise<ServiceResult<TripParticipantDetails>> {
  const result = await supabase
    .rpc('get_trip_participant_details', { p_trip_id: tripId })
    .maybeSingle();

  if (result.error) {
    return serviceError('load-participant-details', result.error);
  }

  return {
    data: (result.data as TripParticipantDetails | null) ?? null,
    error: null,
  };
}

export async function updateDriverLocation(
  driverId: string,
  location: DriverLocation,
): Promise<ServiceResult<boolean>> {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return { data: null, error: 'No pudimos obtener coordenadas válidas para compartir.' };
  }

  const result = await supabase
    .from('drivers')
    .update({
      current_lat: location.latitude,
      current_lng: location.longitude,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId);

  if (result.error) {
    return serviceError('update-driver-location', result.error);
  }
  return { data: true, error: null };
}

export async function requestTrip(
  passengerId: string,
  dropoffAddress: string,
  pickup: {
    address: string;
    latitude: number;
    longitude: number;
  },
  destination?: {
    latitude: number;
    longitude: number;
  },
): Promise<ServiceResult<Trip>> {
  if (!Number.isFinite(pickup.latitude) || !Number.isFinite(pickup.longitude)) {
    return {
      data: null,
      error: 'Necesitamos una ubicación válida antes de solicitar el viaje.',
    };
  }

  const result = await supabase
    .from('trips')
    .insert({
      passenger_id: passengerId,
      passenger_pin: generatePassengerPin(),
      pickup_address: pickup.address,
      pickup_lat: pickup.latitude,
      pickup_lng: pickup.longitude,
      dropoff_address: dropoffAddress.trim(),
      dropoff_lat: destination?.latitude ?? null,
      dropoff_lng: destination?.longitude ?? null,
    })
    .select(TRIP_COLUMNS)
    .single();

  if (result.error) {
    return serviceError('request-trip', result.error);
  }

  const passengerResult = await supabase
    .from('passenger_trips')
    .select(PASSENGER_TRIP_COLUMNS)
    .eq('id', result.data.id)
    .single();

  if (passengerResult.error) {
    return serviceError('request-trip', passengerResult.error);
  }

  return { data: passengerResult.data as Trip, error: null };
}

export async function getPassengerActiveTrip(passengerId: string): Promise<ServiceResult<Trip>> {
  const activeResult = await supabase
    .from('passenger_trips')
    .select(PASSENGER_TRIP_COLUMNS)
    .eq('passenger_id', passengerId)
    .in('status', ['requested', 'offered', 'accepted', 'arrived', 'in_progress'] satisfies TripStatus[])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeResult.error) {
    return serviceError('load-passenger-trip', activeResult.error);
  }
  if (activeResult.data) return { data: activeResult.data as Trip, error: null };

  return getUnratedCompletedTrip(passengerId, 'passenger_id');
}

export async function getDriverActiveTrip(driverId: string): Promise<ServiceResult<Trip>> {
  const activeResult = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'arrived', 'in_progress'] satisfies TripStatus[])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeResult.error) {
    return serviceError('load-open-trips', activeResult.error);
  }
  if (activeResult.data) return { data: activeResult.data as Trip, error: null };

  return getUnratedCompletedTrip(driverId, 'driver_id');
}

export async function getTripHistory(
  userId: string,
  role: UserRole,
): Promise<ServiceResult<TripHistoryItem[]>> {
  const participantColumn = role === 'conductor' ? 'driver_id' : 'passenger_id';
  const tripsResult = await supabase
    .from(role === 'pasajero' ? 'passenger_trips' : 'trips')
    .select(role === 'pasajero' ? PASSENGER_TRIP_COLUMNS : TRIP_COLUMNS)
    .eq(participantColumn, userId)
    .eq('status', 'completed' satisfies TripStatus)
    .order('completed_at', { ascending: false });

  if (tripsResult.error) {
    return serviceError('load-history', tripsResult.error);
  }

  const trips = (tripsResult.data as unknown as Trip[] | null) ?? [];
  if (!trips.length) return { data: [], error: null };

  const ratingsResult = await supabase
    .from('ratings')
    .select('trip_id,rated_by,rated_user,score')
    .in('trip_id', trips.map((trip) => trip.id))
    .or(`rated_by.eq.${userId},rated_user.eq.${userId}`);

  if (ratingsResult.error) {
    return serviceError('load-history', ratingsResult.error);
  }

  const ratings = (ratingsResult.data ?? []) as Array<{
    trip_id: string;
    rated_by: string;
    rated_user: string;
    score: number;
  }>;

  return {
    data: trips.map((trip) => {
      const { sentRating, receivedRating } = ratingSummaryForUser(ratings, userId, trip.id);
      return {
        trip,
        sentRating,
        receivedRating,
      };
    }),
    error: null,
  };
}

async function getUnratedCompletedTrip(
  userId: string,
  participantColumn: 'passenger_id' | 'driver_id',
): Promise<ServiceResult<Trip>> {
  const tripsResult = await supabase
    .from(participantColumn === 'passenger_id' ? 'passenger_trips' : 'trips')
    .select(TRIP_COLUMNS)
    .eq(participantColumn, userId)
    .eq('status', 'completed' satisfies TripStatus)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (tripsResult.error) {
    return serviceError('load-rating', tripsResult.error);
  }

  const completedTrips = (tripsResult.data as Trip[] | null) ?? [];
  if (!completedTrips.length) return { data: null, error: null };

  const ratingsResult = await supabase
    .from('ratings')
    .select('trip_id,rated_by,rated_user,score')
    .in('trip_id', completedTrips.map((trip) => trip.id));

  if (ratingsResult.error) {
    return serviceError('load-rating', ratingsResult.error);
  }

  const ratings = (ratingsResult.data ?? []) as Array<{
    trip_id: string;
    rated_by: string;
    rated_user: string;
    score: number;
  }>;
  return {
    data: findUnratedCompletedTrip(completedTrips, ratings, userId) as Trip | null,
    error: null,
  };
}

export async function getOpenTrips(): Promise<ServiceResult<Trip[]>> {
  const result = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .in('status', ['requested', 'offered'] satisfies TripStatus[])
    .order('requested_at', { ascending: false });

  if (result.error) {
    return serviceError('load-open-trips', result.error);
  }

  return { data: (result.data as Trip[]) ?? [], error: null };
}

export async function acceptTrip(tripId: string, driverId: string): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .rpc('accept_trip', { p_trip_id: tripId })
    .maybeSingle();

  if (result.error) {
    return serviceError('accept-trip', result.error);
  }

  if (!result.data) {
    return {
      data: null,
      error: 'Este viaje ya fue aceptado por otro conductor o ya no está disponible.',
    };
  }

  const trip = result.data as Trip;
  if (trip.driver_id !== driverId) {
    return { data: null, error: 'Supabase devolvió una asignación de viaje inválida.' };
  }
  return { data: trip, error: null };
}

export async function updateTripStatus(
  tripId: string,
  driverId: string,
  status: Extract<TripStatus, 'in_progress' | 'completed'>,
  passengerPin?: string,
): Promise<ServiceResult<Trip>> {
  if (status === 'in_progress' && !/^\d{4}$/.test(passengerPin ?? '')) {
    return { data: null, error: 'Escribe el PIN de cuatro dígitos que muestra el pasajero.' };
  }

  const result = await supabase
    .rpc(status === 'in_progress' ? 'start_trip' : 'complete_trip', {
      p_trip_id: tripId,
      ...(status === 'in_progress' ? { p_passenger_pin: passengerPin } : {}),
    })
    .maybeSingle();

  if (result.error) {
    return serviceError('update-trip', result.error);
  }
  if (!result.data) {
    return { data: null, error: 'Este viaje ya no está disponible para actualizarse.' };
  }
  if ((result.data as Trip).driver_id !== driverId) {
    return { data: null, error: 'Supabase devolvió una asignación de viaje inválida.' };
  }
  return { data: result.data as Trip, error: null };
}

export async function cancelTrip(
  tripId: string,
  participantId: string,
  reason?: string,
): Promise<ServiceResult<Trip>> {
  const result = await supabase
    .rpc('cancel_trip', { p_trip_id: tripId, p_reason: reason?.trim() || null })
    .maybeSingle();

  if (result.error) {
    return serviceError('cancel-trip', result.error);
  }
  if (!result.data) {
    return { data: null, error: 'Este viaje ya no puede cancelarse.' };
  }
  const trip = result.data as Trip;
  if (trip.passenger_id !== participantId && trip.driver_id !== participantId) {
    return { data: null, error: 'Supabase devolvió participantes inválidos.' };
  }
  return { data: trip, error: null };
}

export async function rateTrip(
  trip: Trip,
  userId: string,
  score: number,
): Promise<ServiceResult<boolean>> {
  const ratedUser = trip.passenger_id === userId ? trip.driver_id : trip.passenger_id;
  if (!ratedUser || trip.status !== 'completed') {
    return { data: null, error: 'Solo puedes calificar a la otra persona cuando el viaje haya terminado.' };
  }

  const result = await supabase.from('ratings').insert({
    trip_id: trip.id,
    rated_by: userId,
    rated_user: ratedUser,
    score,
  });

  if (result.error) {
    return serviceError('rate-trip', result.error);
  }
  return { data: true, error: null };
}

export function subscribeToTrips(
  userId: string,
  role: UserRole,
  onChange: () => void,
) {
  const column = role === 'conductor' ? 'driver_id' : 'passenger_id';
  const channel = supabase
    .channel(`trips:${role}:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips', filter: `${column}=eq.${userId}` },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
  const reconciliationTimer = setInterval(onChange, TRIP_RECONCILIATION_INTERVAL_MS);

  return () => {
    clearInterval(reconciliationTimer);
    void supabase.removeChannel(channel);
  };
}

export function subscribeToOpenTrips(onChange: () => void) {
  const channel = supabase
    .channel('trips:open')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, onChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });
  const reconciliationTimer = setInterval(onChange, TRIP_RECONCILIATION_INTERVAL_MS);

  return () => {
    clearInterval(reconciliationTimer);
    void supabase.removeChannel(channel);
  };
}

export function subscribeToDriverLocation(driverId: string, onChange: () => void) {
  const channel = supabase
    .channel(`driver-location:${driverId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
      onChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange();
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function tripDestination(trip: Trip) {
  return trip.dropoff_address || 'Destino sin especificar';
}

function generatePassengerPin() {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}
