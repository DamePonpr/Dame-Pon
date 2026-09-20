import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_RLS_PASSENGER_EMAIL',
  'SUPABASE_RLS_PASSENGER_PASSWORD',
];

const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`[FAIL] configuración: faltan variables: ${missing.join(', ')}`);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function checkError(step, error) {
  if (!error) return;
  throw new Error(`[FAIL] ${step}: ${[error.code, error.message, error.details, error.hint].filter(Boolean).join(' | ')}`);
}

async function run() {
  const auth = await supabase.auth.signInWithPassword({
    email: process.env.SUPABASE_RLS_PASSENGER_EMAIL,
    password: process.env.SUPABASE_RLS_PASSENGER_PASSWORD,
  });
  checkError('autenticación del pasajero', auth.error);
  if (!auth.data.user) throw new Error('[FAIL] autenticación del pasajero: no devolvió usuario.');

  // This is intentionally the same shape sent by requestTrip in rideService.ts.
  const payload = {
    passenger_id: auth.data.user.id,
    passenger_pin: '1234',
    pickup_address: 'Ubicación actual',
    pickup_lat: 18.4655,
    pickup_lng: -66.1057,
    dropoff_address: `Solicitud exacta ${runId}`,
  };

  const response = await supabase
    .from('trips')
    .insert(payload)
    .select('id,passenger_id,driver_id,status,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,fare_estimate,fare_final,distance_km,accepted_at,started_at,completed_at')
    .single();
  checkError('insert exacto de requestTrip', response.error);

  const trip = response.data;
  if (!trip) throw new Error('[FAIL] insert exacto de requestTrip: no devolvió viaje.');
  const assertions = [
    ['passenger_id', trip.passenger_id === auth.data.user.id],
    ['driver_id NULL', trip.driver_id === null],
    ['status inicial', trip.status === 'requested'],
    ['pickup_address', trip.pickup_address === payload.pickup_address],
    ['pickup_lat', trip.pickup_lat === payload.pickup_lat],
    ['pickup_lng', trip.pickup_lng === payload.pickup_lng],
    ['dropoff_address', trip.dropoff_address === payload.dropoff_address],
    ['dropoff_lat NULL', trip.dropoff_lat === null],
    ['dropoff_lng NULL', trip.dropoff_lng === null],
    ['fare_estimate NULL', trip.fare_estimate === null],
    ['fare_final NULL', trip.fare_final === null],
    ['distance_km NULL', trip.distance_km === null],
    ['accepted_at NULL', trip.accepted_at === null],
    ['started_at NULL', trip.started_at === null],
    ['completed_at NULL', trip.completed_at === null],
  ];
  const failed = assertions.filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`[FAIL] valores iniciales del viaje: ${failed.join(', ')}`);
  console.log('[OK] payload exacto de requestTrip: origen, destino y estado inicial correctos');
  console.log('[OK] campos protegidos y coordenadas de destino quedaron NULL');

  const cancelled = await supabase.rpc('cancel_trip', { p_trip_id: trip.id }).single();
  checkError('limpiar viaje de prueba', cancelled.error);
  if (cancelled.data?.status !== 'cancelled') {
    throw new Error('[FAIL] limpiar viaje de prueba: no quedó cancelado.');
  }
  console.log('[OK] viaje de prueba limpiado mediante cancel_trip');
}

try {
  await run();
} finally {
  await supabase.auth.signOut();
}