import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_RLS_PASSENGER_EMAIL',
  'SUPABASE_RLS_PASSENGER_PASSWORD',
  'SUPABASE_RLS_DRIVER_EMAIL',
  'SUPABASE_RLS_DRIVER_PASSWORD',
];

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const timeoutMs = 12_000;
const created = { tripId: null };
const clients = [];
const channels = [];
const observations = [];

function fail(step, detail) {
  throw new Error(`[FAIL] ${step}: ${detail}`);
}

function checkError(step, error) {
  if (!error) return;
  fail(step, [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | '));
}

function client() {
  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  clients.push(supabase);
  return supabase;
}

async function signIn(label, email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  checkError(`autenticación de ${label}`, error);
  if (!data.user || !data.session) fail(`autenticación de ${label}`, 'Supabase no devolvió una sesión.');
  return { supabase, user: data.user };
}

function deferredEvent(label) {
  let timer;
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    timer = setTimeout(() => reject(new Error(`[FAIL] ${label}: no llegó sin recargar en ${timeoutMs} ms.`)), timeoutMs);
  });
  return {
    promise,
    resolve(payload) {
      clearTimeout(timer);
      resolvePromise(payload);
    },
    reject(error) {
      clearTimeout(timer);
      rejectPromise(error);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}

async function subscribe(label, channel) {
  channels.push(channel);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[FAIL] ${label}: el canal no quedó listo.`)), timeoutMs);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(error ?? new Error(`[FAIL] ${label}: ${status}`));
      }
    });
  });
}

function watchTrip(clientInstance, channelName, filter, expectedStatus, event = 'UPDATE') {
  const observed = deferredEvent(`${channelName} → ${expectedStatus}`);
  observations.push(observed);
  let polling = false;
  const matchesExpectedTrip = (row) => (
    row
    && row.status === expectedStatus
    && (
      created.tripId
        ? row.id === created.tripId
        : row.dropoff_address === `Realtime destino ${runId}`
    )
  );
  const resolveObserved = (row, source) => {
    clearInterval(reconciliationTimer);
    observed.resolve({ row, source });
  };
  const channel = clientInstance
    .channel(`${channelName}:${runId}`)
    .on(
      'postgres_changes',
      { event, schema: 'public', table: 'trips', ...(filter ? { filter } : {}) },
      (payload) => {
        const row = payload.new;
        if (matchesExpectedTrip(row)) resolveObserved(row, 'realtime');
      },
    );
  const reconcile = async () => {
    if (polling) return;
    polling = true;
    let query = clientInstance
      .from('trips')
      .select('id,status,dropoff_address')
      .eq('status', expectedStatus);
    query = created.tripId
      ? query.eq('id', created.tripId)
      : query.eq('dropoff_address', `Realtime destino ${runId}`);
    const response = await query.maybeSingle();
    polling = false;
    if (response.error) {
      clearInterval(reconciliationTimer);
      observed.reject(new Error(`[FAIL] ${channelName}: ${response.error.message}`));
    } else if (matchesExpectedTrip(response.data)) {
      resolveObserved(response.data, 'reconciliation');
    }
  };
  const reconciliationTimer = setInterval(() => void reconcile(), 500);
  const cancelObservation = observed.cancel;
  observed.cancel = () => {
    clearInterval(reconciliationTimer);
    cancelObservation();
  };
  return { observed, channel };
}

function deliveryLabel(result) {
  return result.source === 'realtime' ? 'evento Realtime' : 'reconciliación automática';
}

async function updateStatus(driver, status, timestampColumn) {
  const response = await driver.supabase
    .from('trips')
    .update({ status, [timestampColumn]: new Date().toISOString() })
    .eq('id', created.tripId)
    .eq('driver_id', driver.user.id)
    .select('id,status')
    .single();
  checkError(`cambiar viaje a ${status}`, response.error);
}

async function run() {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length) fail('configuración', `faltan variables: ${missing.join(', ')}`);
  if (process.env.SUPABASE_RLS_PASSENGER_EMAIL === process.env.SUPABASE_RLS_DRIVER_EMAIL) {
    fail('configuración', 'pasajero y conductor deben usar cuentas distintas.');
  }

  const [passenger, driver] = await Promise.all([
    signIn('pasajero', process.env.SUPABASE_RLS_PASSENGER_EMAIL, process.env.SUPABASE_RLS_PASSENGER_PASSWORD),
    signIn('conductor', process.env.SUPABASE_RLS_DRIVER_EMAIL, process.env.SUPABASE_RLS_DRIVER_PASSWORD),
  ]);
  if (passenger.user.id === driver.user.id) fail('sesiones separadas', 'ambas cuentas devolvieron el mismo usuario.');
  console.log('[OK] pasajero y conductor: sesiones autenticadas separadas');

  for (const [actor, role] of [[passenger, 'pasajero'], [driver, 'conductor']]) {
    const existingProfile = await actor.supabase
      .from('profiles')
      .select('id,role')
      .eq('id', actor.user.id)
      .maybeSingle();
    checkError(`consultar perfil de ${role}`, existingProfile.error);
    if (existingProfile.data) continue;

    const profileResponse = await actor.supabase
      .from('profiles')
      .insert({
        id: actor.user.id,
        full_name: `Realtime ${role}`,
        phone: '+1 787 555 0100',
        role,
      })
      .select('id,role')
      .single();
    checkError(`preparar perfil de ${role}`, profileResponse.error);
  }

  let response = await driver.supabase
    .from('drivers')
    .upsert(
      {
        id: driver.user.id,
        is_online: true,
        license_number: `RT-${runId.slice(-10).toUpperCase()}`,
        status: 'aprobado',
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();
  checkError('preparar conductor', response.error);

  const requestWatch = watchTrip(driver.supabase, 'conductor-solicitud', null, 'buscando_conductor', 'INSERT');
  await subscribe('solicitudes abiertas del conductor', requestWatch.channel);

  response = await passenger.supabase
    .from('trips')
    .insert({
      passenger_id: passenger.user.id,
      driver_id: null,
      pickup_address: `Realtime origen ${runId}`,
      pickup_lat: 18.4655,
      pickup_lng: -66.1057,
      dropoff_address: `Realtime destino ${runId}`,
      dropoff_lat: 18.4064,
      dropoff_lng: -66.0644,
      status: 'buscando_conductor',
      requested_at: new Date().toISOString(),
    })
    .select('id,status')
    .single();
  checkError('solicitar viaje', response.error);
  created.tripId = response.data.id;
  const requestDelivery = await requestWatch.observed.promise;
  console.log(`[OK] solicitud: conductor actualizado por ${deliveryLabel(requestDelivery)}`);

  const acceptedWatch = watchTrip(
    passenger.supabase,
    'pasajero-aceptacion',
    `passenger_id=eq.${passenger.user.id}`,
    'aceptado',
  );
  await subscribe('viaje del pasajero', acceptedWatch.channel);

  const tamperedDestination = `Destino alterado ${runId}`;
  const tamperResponse = await driver.supabase
    .from('trips')
    .update({
      driver_id: driver.user.id,
      status: 'aceptado',
      accepted_at: new Date().toISOString(),
      dropoff_address: tamperedDestination,
    })
    .eq('id', created.tripId)
    .eq('status', 'buscando_conductor')
    .select('id');
  if (!tamperResponse.error && (tamperResponse.data ?? []).length > 0) {
    fail('integridad de aceptación', 'RLS permitió alterar el destino durante una aceptación directa.');
  }
  console.log('[OK] aceptación: RLS rechazó alterar campos protegidos');

  response = await driver.supabase
    .rpc('accept_trip', { p_trip_id: created.tripId })
    .maybeSingle();
  checkError('aceptar viaje', response.error);
  if (!response.data || response.data.driver_id !== driver.user.id) {
    fail('aceptar viaje', 'La función no asignó el viaje al conductor autenticado.');
  }
  const acceptedDelivery = await acceptedWatch.observed.promise;
  console.log(`[OK] aceptación: pasajero actualizado por ${deliveryLabel(acceptedDelivery)}`);

  const passengerStartedWatch = watchTrip(
    passenger.supabase,
    'pasajero-inicio',
    `passenger_id=eq.${passenger.user.id}`,
    'en_curso',
  );
  const driverStartedWatch = watchTrip(
    driver.supabase,
    'conductor-inicio',
    `driver_id=eq.${driver.user.id}`,
    'en_curso',
  );
  await Promise.all([
    subscribe('inicio para pasajero', passengerStartedWatch.channel),
    subscribe('inicio para conductor', driverStartedWatch.channel),
  ]);
  await updateStatus(driver, 'en_curso', 'started_at');
  const [passengerStartedDelivery, driverStartedDelivery] = await Promise.all([
    passengerStartedWatch.observed.promise,
    driverStartedWatch.observed.promise,
  ]);
  console.log(
    `[OK] inicio: pasajero por ${deliveryLabel(passengerStartedDelivery)}; conductor por ${deliveryLabel(driverStartedDelivery)}`,
  );

  const passengerCompletedWatch = watchTrip(
    passenger.supabase,
    'pasajero-finalizacion',
    `passenger_id=eq.${passenger.user.id}`,
    'completado',
  );
  const driverCompletedWatch = watchTrip(
    driver.supabase,
    'conductor-finalizacion',
    `driver_id=eq.${driver.user.id}`,
    'completado',
  );
  await Promise.all([
    subscribe('finalización para pasajero', passengerCompletedWatch.channel),
    subscribe('finalización para conductor', driverCompletedWatch.channel),
  ]);
  await updateStatus(driver, 'completado', 'completed_at');
  const [passengerCompletedDelivery, driverCompletedDelivery] = await Promise.all([
    passengerCompletedWatch.observed.promise,
    driverCompletedWatch.observed.promise,
  ]);
  console.log(
    `[OK] finalización: pasajero por ${deliveryLabel(passengerCompletedDelivery)}; conductor por ${deliveryLabel(driverCompletedDelivery)}`,
  );

  const ratingRows = [
    {
      trip_id: created.tripId,
      rated_by: passenger.user.id,
      rated_user: driver.user.id,
      score: 5,
    },
    {
      trip_id: created.tripId,
      rated_by: driver.user.id,
      rated_user: passenger.user.id,
      score: 5,
    },
  ];
  for (const [index, rating] of ratingRows.entries()) {
    const actor = index === 0 ? passenger : driver;
    response = await actor.supabase.from('ratings').insert(rating);
    checkError(`calificación de ${index === 0 ? 'pasajero' : 'conductor'}`, response.error);
  }
  console.log('[OK] calificación: ambos participantes calificaron al usuario correcto');
  console.log('\nFlujo integral verificado con actualización automática y sin recargas manuales.');
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  observations.forEach((observation) => observation.cancel());
  await Promise.all(channels.map((channel) => channel.unsubscribe()));
  await Promise.all(clients.map((supabase) => supabase.auth.signOut()));
}