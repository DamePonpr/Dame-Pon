import { createClient } from '@supabase/supabase-js';

const requiredEnvironment = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_RLS_PASSENGER_EMAIL',
  'SUPABASE_RLS_PASSENGER_PASSWORD',
  'SUPABASE_RLS_DRIVER_EMAIL',
  'SUPABASE_RLS_DRIVER_PASSWORD',
];

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const plate = `RLS-${runId.slice(-6).toUpperCase()}`;
const created = { tripId: null, vehicleId: null };

function client() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function classify(error) {
  const code = String(error?.code ?? '').toUpperCase();
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();

  if (
    error?.status === 401
    || message.includes('invalid api key')
    || message.includes('invalid jwt')
    || message.includes('jwt expired')
    || message.includes('email not confirmed')
    || message.includes('invalid login credentials')
  ) {
    return 'authentication';
  }
  if (
    code === '42703'
    || code === '42P01'
    || code === 'PGRST204'
    || code === '22P02'
    || message.includes('schema cache')
    || (message.includes('column') && message.includes('does not exist'))
    || (message.includes('relation') && message.includes('does not exist'))
    || message.includes('invalid input value for enum')
  ) {
    return 'schema';
  }
  if (
    code === '42501'
    || code === 'PGRST301'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('not authorized')
  ) {
    return 'rls';
  }
  return 'operation';
}

function fail(category, step, detail) {
  console.error(`\n[FAIL:${category}] ${step}\n${detail}`);
  process.exitCode = 1;
  throw new Error(`${category}:${step}`);
}

function checkError(step, error) {
  if (!error) return;
  fail(classify(error), step, [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | '));
}

function assertRowsHidden(step, rows) {
  if ((rows ?? []).length > 0) {
    fail('rls', step, `La consulta expuso ${rows.length} fila(s) que pertenecen a otro usuario.`);
  }
}

async function signIn(label, email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  checkError(`autenticación de ${label}`, error);
  if (!data.user || !data.session) {
    fail('authentication', `autenticación de ${label}`, 'Supabase no devolvió una sesión autenticada.');
  }
  console.log(`[OK] identidad de ${label}: sesión independiente`);
  return { supabase, user: data.user };
}

async function run() {
  const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
  if (missingEnvironment.length) {
    fail(
      'authentication',
      'configuración',
      `Faltan variables para las dos identidades de prueba: ${missingEnvironment.join(', ')}.`,
    );
  }
  if (process.env.SUPABASE_RLS_PASSENGER_EMAIL === process.env.SUPABASE_RLS_DRIVER_EMAIL) {
    fail('authentication', 'configuración', 'Pasajero y conductor deben usar identidades distintas.');
  }

  const passenger = await signIn(
    'pasajero',
    process.env.SUPABASE_RLS_PASSENGER_EMAIL,
    process.env.SUPABASE_RLS_PASSENGER_PASSWORD,
  );
  const driver = await signIn(
    'conductor',
    process.env.SUPABASE_RLS_DRIVER_EMAIL,
    process.env.SUPABASE_RLS_DRIVER_PASSWORD,
  );

  if (passenger.user.id === driver.user.id) {
    fail('authentication', 'separación de identidades', 'Ambas sesiones corresponden al mismo usuario.');
  }

  let response = await driver.supabase
    .from('drivers')
    .upsert({ id: driver.user.id, is_online: false }, { onConflict: 'id' })
    .select('id,status,is_online,updated_at')
    .single();
  checkError('alta/actualización del conductor', response.error);

  response = await driver.supabase
    .from('vehicles')
    .insert({
      driver_id: driver.user.id,
      make: 'RLS Check',
      model: 'Inicial',
      year: 2026,
      color: 'Negro',
      plate,
    })
    .select('id,driver_id,make,model,year,color,plate')
    .single();
  checkError('alta del vehículo', response.error);
  created.vehicleId = response.data.id;

  response = await driver.supabase
    .from('vehicles')
    .update({ model: 'Actualizado', color: 'Blanco' })
    .eq('id', created.vehicleId)
    .eq('driver_id', driver.user.id)
    .select('id,model,color')
    .single();
  checkError('actualización del vehículo', response.error);
  if (response.data.model !== 'Actualizado' || response.data.color !== 'Blanco') {
    fail('rls', 'actualización del vehículo', 'La escritura no devolvió los valores actualizados.');
  }
  console.log('[OK] vehículo: alta y actualización');

  response = await driver.supabase
    .from('drivers')
    .update({ is_online: true })
    .eq('id', driver.user.id)
    .select('id,is_online')
    .single();
  checkError('activar disponibilidad', response.error);
  if (response.data.is_online !== true) {
    fail('rls', 'activar disponibilidad', 'El conductor no quedó disponible.');
  }
  console.log('[OK] conductor: disponibilidad');

  response = await passenger.supabase
    .from('trips')
    .insert({
      passenger_id: passenger.user.id,
      driver_id: null,
      pickup_address: `RLS origen ${runId}`,
      pickup_lat: null,
      pickup_lng: null,
      dropoff_address: `RLS destino ${runId}`,
      dropoff_lat: null,
      dropoff_lng: null,
      status: 'buscando_conductor',
      requested_at: new Date().toISOString(),
    })
    .select('id,status,passenger_id,driver_id,pickup_address,dropoff_address,requested_at')
    .single();
  checkError('solicitud del viaje', response.error);
  created.tripId = response.data.id;
  console.log('[OK] pasajero: solicitud de viaje');

  response = await passenger.supabase
    .from('trips')
    .select('id')
    .neq('passenger_id', passenger.user.id);
  checkError('aislamiento de viajes para pasajero', response.error);
  assertRowsHidden('aislamiento de viajes para pasajero', response.data);

  response = await driver.supabase
    .from('trips')
    .select('id,status')
    .eq('id', created.tripId)
    .eq('status', 'buscando_conductor')
    .single();
  checkError('visibilidad de solicitudes abiertas', response.error);

  response = await driver.supabase
    .from('trips')
    .update({
      driver_id: driver.user.id,
      status: 'aceptado',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', created.tripId)
    .eq('status', 'buscando_conductor')
    .select('id,status,passenger_id,driver_id,accepted_at')
    .single();
  checkError('aceptación del viaje', response.error);
  if (response.data.driver_id !== driver.user.id || response.data.passenger_id !== passenger.user.id) {
    fail('rls', 'aceptación del viaje', 'El viaje aceptado no conserva a sus participantes correctos.');
  }

  response = await driver.supabase
    .from('trips')
    .select('id')
    .neq('driver_id', driver.user.id)
    .neq('status', 'buscando_conductor');
  checkError('aislamiento de viajes privados para conductor', response.error);
  assertRowsHidden('aislamiento de viajes privados para conductor', response.data);
  console.log('[OK] viaje: aceptación y aislamiento entre usuarios');

  response = await driver.supabase
    .from('trips')
    .update({ status: 'completado', completed_at: new Date().toISOString() })
    .eq('id', created.tripId)
    .eq('driver_id', driver.user.id)
    .select('id')
    .single();
  checkError('cierre del viaje de prueba', response.error);

  response = await driver.supabase
    .from('drivers')
    .update({ is_online: false })
    .eq('id', driver.user.id)
    .select('id')
    .single();
  checkError('restaurar disponibilidad', response.error);

  console.log('\nSupabase RLS verificado: esquema, autenticación, operaciones e aislamiento correctos.');
}

try {
  await run();
} catch (error) {
  if (!process.exitCode) {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  // Las cuentas son dedicadas a esta comprobación. Se intenta retirar el
  // vehículo creado, pero no se oculta un fallo principal si DELETE no forma
  // parte de las políticas de producción.
  if (
    created.vehicleId
    && process.env.SUPABASE_RLS_DRIVER_EMAIL
    && process.env.SUPABASE_RLS_DRIVER_PASSWORD
  ) {
    const cleanup = client();
    const { data } = await cleanup.auth.signInWithPassword({
      email: process.env.SUPABASE_RLS_DRIVER_EMAIL,
      password: process.env.SUPABASE_RLS_DRIVER_PASSWORD,
    });
    if (data.session) {
      await cleanup.from('vehicles').delete().eq('id', created.vehicleId);
    }
  }
}