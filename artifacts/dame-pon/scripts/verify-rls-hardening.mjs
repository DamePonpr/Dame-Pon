import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_RLS_PASSENGER_EMAIL',
  'SUPABASE_RLS_PASSENGER_PASSWORD',
  'SUPABASE_RLS_DRIVER_EMAIL',
  'SUPABASE_RLS_DRIVER_PASSWORD',
];

const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`[FAIL] configuración: faltan variables: ${missing.join(', ')}`);
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clients = [];
const createdTripIds = [];

function fail(step, detail) {
  throw new Error(`[FAIL] ${step}: ${detail}`);
}

function errorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
}

function checkError(step, error) {
  if (error) fail(step, errorText(error));
}

function client() {
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  clients.push(supabase);
  return supabase;
}

async function signIn(label, email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  checkError(`autenticación de ${label}`, error);
  if (!data.user || !data.session) fail(`autenticación de ${label}`, 'No se devolvió una sesión.');
  return { supabase, user: data.user };
}

async function expectDenied(step, request) {
  const response = await request;
  if (!response.error) {
    const rows = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    if (rows.length) fail(step, 'La operación no autorizada modificó datos.');
    fail(step, 'La operación no autorizada no devolvió un error.');
  }
  console.log(`[OK] ${step}: ${errorText(response.error)}`);
}

async function createTrip(passenger) {
  const response = await passenger.supabase
    .from('trips')
    .insert({
      passenger_id: passenger.user.id,
      pickup_address: `RLS origen ${runId}`,
      pickup_lat: 18.4655,
      pickup_lng: -66.1057,
      dropoff_address: `RLS destino ${runId}`,
    })
    .select('id,status,driver_id')
    .single();
  checkError('crear viaje de prueba', response.error);
  if (!response.data) fail('crear viaje de prueba', 'Supabase no devolvió el viaje.');
  createdTripIds.push(response.data.id);
  if (response.data.status !== 'buscando_conductor' || response.data.driver_id !== null) {
    fail('estado inicial del viaje', 'El viaje no comenzó abierto y sin conductor.');
  }
  return response.data.id;
}

async function expectRpcDenied(step, actor, functionName, tripId) {
  const response = await actor.supabase.rpc(functionName, { p_trip_id: tripId }).maybeSingle();
  if (!response.error) {
    if (response.data) fail(step, 'La función permitió una transición no autorizada.');
    fail(step, 'La función no rechazó la transición no autorizada.');
  }
  console.log(`[OK] ${step}: ${errorText(response.error)}`);
}

async function run() {
  if (process.env.SUPABASE_RLS_PASSENGER_EMAIL === process.env.SUPABASE_RLS_DRIVER_EMAIL) {
    fail('configuración', 'Pasajero y conductor deben ser cuentas distintas.');
  }

  const [passenger, driver] = await Promise.all([
    signIn('pasajero', process.env.SUPABASE_RLS_PASSENGER_EMAIL, process.env.SUPABASE_RLS_PASSENGER_PASSWORD),
    signIn('conductor', process.env.SUPABASE_RLS_DRIVER_EMAIL, process.env.SUPABASE_RLS_DRIVER_PASSWORD),
  ]);
  if (passenger.user.id === driver.user.id) fail('sesiones separadas', 'Las cuentas devolvieron el mismo usuario.');
  console.log('[OK] sesiones separadas');

  const [passengerProfile, driverProfile] = await Promise.all([
    passenger.supabase.from('profiles').select('id,role').eq('id', passenger.user.id).single(),
    driver.supabase.from('profiles').select('id,role').eq('id', driver.user.id).single(),
  ]);
  checkError('leer perfil de pasajero', passengerProfile.error);
  checkError('leer perfil de conductor', driverProfile.error);
  if (passengerProfile.data.role !== 'pasajero') fail('rol de pasajero', 'La cuenta de prueba no tiene rol pasajero.');
  if (driverProfile.data.role !== 'conductor') fail('rol de conductor', 'La cuenta de prueba no tiene rol conductor.');

  const driverRecord = await driver.supabase
    .from('drivers')
    .select('id,status,is_online')
    .eq('id', driver.user.id)
    .single();
  checkError('leer conductor de prueba', driverRecord.error);
  if (driverRecord.data.status !== 'aprobado') {
    fail('conductor de prueba', 'La cuenta debe estar aprobada por un administrador para ejecutar estas pruebas.');
  }
  const online = await driver.supabase
    .from('drivers')
    .update({ is_online: true })
    .eq('id', driver.user.id)
    .select('id,is_online')
    .single();
  checkError('poner conductor de prueba en línea', online.error);

  await expectDenied(
    'escalada de perfil',
    driver.supabase
      .from('profiles')
      .update({ role: 'admin', rating: 1 })
      .eq('id', driver.user.id)
      .select('id,role,rating')
      .single(),
  );
  await expectDenied(
    'escalada de aprobación del conductor',
    driver.supabase
      .from('drivers')
      .update({ status: 'suspendido' })
      .eq('id', driver.user.id)
      .select('id,status')
      .single(),
  );

  const passengerProfileFromDriver = await driver.supabase
    .from('profiles')
    .select('id,phone,avatar_url')
    .eq('id', passenger.user.id)
    .maybeSingle();
  checkError('privacidad del perfil del pasajero', passengerProfileFromDriver.error);
  if (passengerProfileFromDriver.data) {
    fail('privacidad del perfil del pasajero', 'El conductor pudo leer datos del pasajero fuera de un viaje.');
  }

  const driverProfileFromPassenger = await passenger.supabase
    .from('profiles')
    .select('id,phone,avatar_url')
    .eq('id', driver.user.id)
    .maybeSingle();
  checkError('privacidad del perfil del conductor', driverProfileFromPassenger.error);
  if (driverProfileFromPassenger.data) {
    fail('privacidad del perfil del conductor', 'El pasajero pudo leer el perfil fuera de un viaje.');
  }
  console.log('[OK] perfiles ajenos no exponen teléfono ni otros datos');

  const firstTripId = await createTrip(passenger);

  await expectDenied(
    'pasajero no puede insertar campos protegidos del viaje',
    passenger.supabase
      .from('trips')
      .insert({
        passenger_id: passenger.user.id,
        driver_id: driver.user.id,
        pickup_address: `RLS inserción protegida ${runId}`,
        pickup_lat: 18.4655,
        pickup_lng: -66.1057,
        dropoff_address: `RLS inserción protegida ${runId}`,
        dropoff_lat: 18.4064,
        dropoff_lng: -66.0644,
        status: 'completado',
        fare_final: 1,
      })
      .select('id')
      .single(),
  );

  await expectDenied(
    'pasajero no puede modificar estado, conductor ni tarifa',
    passenger.supabase
      .from('trips')
      .update({
        status: 'completado',
        driver_id: driver.user.id,
        fare_final: 1,
        distance_km: 999,
      })
      .eq('id', firstTripId)
      .select('id,status,driver_id')
      .single(),
  );
  await expectDenied(
    'conductor no puede modificar directamente el viaje',
    driver.supabase
      .from('trips')
      .update({ status: 'completado', dropoff_address: `Robo ${runId}` })
      .eq('id', firstTripId)
      .select('id,status')
      .single(),
  );
  await expectRpcDenied('pasajero no puede iniciar un viaje', passenger, 'start_trip', firstTripId);
  await expectRpcDenied('conductor no puede completar un viaje solicitado', driver, 'complete_trip', firstTripId);
  await expectRpcDenied('conductor no puede cancelar como pasajero', driver, 'cancel_trip', firstTripId);

  const cancelled = await passenger.supabase.rpc('cancel_trip', { p_trip_id: firstTripId }).single();
  checkError('cancelar viaje como pasajero', cancelled.error);
  if (cancelled.data?.status !== 'cancelado') fail('cancelar viaje como pasajero', 'El viaje no quedó cancelado.');
  console.log('[OK] cancelación válida del pasajero');

  const activeTripId = await createTrip(passenger);
  await expectRpcDenied('pasajero no aprobado no puede aceptar viajes', passenger, 'accept_trip', activeTripId);

  const accepted = await driver.supabase.rpc('accept_trip', { p_trip_id: activeTripId }).single();
  checkError('aceptar viaje como conductor aprobado', accepted.error);
  if (accepted.data?.driver_id !== driver.user.id || accepted.data?.status !== 'aceptado') {
    fail('aceptar viaje como conductor aprobado', 'La aceptación no asignó el viaje correctamente.');
  }
  console.log('[OK] conductor aprobado y en línea aceptó el viaje');

  const secondAcceptance = await driver.supabase.rpc('accept_trip', { p_trip_id: activeTripId }).maybeSingle();
  checkError('no reasignar viaje aceptado', secondAcceptance.error);
  if (secondAcceptance.data) fail('no reasignar viaje aceptado', 'Una segunda aceptación devolvió una asignación.');
  console.log('[OK] una segunda aceptación no roba ni reasigna el viaje');

  const assignedLocation = await passenger.supabase
    .from('drivers')
    .select('id,current_lat,current_lng')
    .eq('id', driver.user.id)
    .maybeSingle();
  checkError('ubicación del conductor asignado', assignedLocation.error);
  if (!assignedLocation.data) fail('ubicación del conductor asignado', 'El pasajero no pudo ver la ubicación de su viaje activo.');

  const otherDriverRows = await passenger.supabase
    .from('drivers')
    .select('id,current_lat,current_lng')
    .neq('id', driver.user.id);
  checkError('aislamiento de ubicaciones', otherDriverRows.error);
  if ((otherDriverRows.data ?? []).length) {
    fail('aislamiento de ubicaciones', 'El pasajero pudo ver conductores no asignados.');
  }
  console.log('[OK] el pasajero solo ve la ubicación del conductor de su viaje activo');

  await expectRpcDenied('pasajero no puede completar el viaje', passenger, 'complete_trip', activeTripId);
  await expectRpcDenied('conductor no puede completar sin iniciar', driver, 'complete_trip', activeTripId);

  const started = await driver.supabase.rpc('start_trip', { p_trip_id: activeTripId }).single();
  checkError('iniciar viaje aceptado', started.error);
  if (started.data?.status !== 'en_curso') fail('iniciar viaje aceptado', 'El viaje no pasó a en_curso.');

  await expectRpcDenied('pasajero no puede saltar a en_curso', passenger, 'start_trip', activeTripId);

  const completed = await driver.supabase.rpc('complete_trip', { p_trip_id: activeTripId }).single();
  checkError('completar viaje en curso', completed.error);
  if (completed.data?.status !== 'completado') fail('completar viaje en curso', 'El viaje no pasó a completado.');
  console.log('[OK] las transiciones válidas respetan el orden solicitado → aceptado → en_curso → completado');

  const raceTripId = await createTrip(passenger);
  const race = await Promise.all([
    driver.supabase.rpc('accept_trip', { p_trip_id: raceTripId }).maybeSingle(),
    driver.supabase.rpc('accept_trip', { p_trip_id: raceTripId }).maybeSingle(),
  ]);
  race.forEach((response, index) => checkError(`aceptación concurrente ${index + 1}`, response.error));
  const winners = race.filter((response) => response.data);
  if (winners.length !== 1 || winners[0].data.driver_id !== driver.user.id) {
    fail('aceptación atómica', 'La carrera no produjo exactamente un ganador.');
  }
  console.log('[OK] aceptación atómica: exactamente una llamada ganó la carrera');
}

try {
  await run();
  console.log('\nVerificación de endurecimiento RLS completada.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map((supabase) => supabase.auth.signOut()));
}