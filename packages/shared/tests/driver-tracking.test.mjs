import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDriverTracker, validGpsFix, shouldPublishGps, locationFreshness, assignedTripScope } from '../src/lib/driverTracking.ts';

function fixture(overrides = {}) {
  let time = 1_800_000_000_000;
  let onFix;
  let onError;
  let removed = 0;
  const writes = [];
  const states = [];
  const fix = (changes = {}) => ({ latitude: 18.4, longitude: -66.1, timestamp: time, accuracy: 10, ...changes });
  const tracker = createDriverTracker({
    now: () => time,
    permission: async () => true,
    servicesEnabled: async () => true,
    getFix: async () => fix(),
    watch: async (next, error) => { onFix = next; onError = error; return { remove: () => removed++ }; },
    publish: async (value, start) => { writes.push({ value, start }); },
    onChange: (state) => states.push(state),
    ...overrides,
  });
  return { tracker, writes, states, fix,
    advance: (ms) => { time += ms; },
    emit: (value) => onFix(value),
    fail: (message) => onError(message),
    removed: () => removed,
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('GPS: rechaza coordenadas, precisión y lecturas antiguas o futuras inválidas', () => {
  const f = fixture();
  assert.equal(validGpsFix(f.fix(), f.fix().timestamp), true);
  for (const changes of [
    { latitude: NaN }, { latitude: 91 }, { longitude: -181 }, { timestamp: NaN },
    { timestamp: f.fix().timestamp - 20_001 }, { timestamp: f.fix().timestamp + 10_001 },
    { accuracy: 101 }, { accuracy: -1 },
  ]) assert.equal(validGpsFix(f.fix(changes), f.fix().timestamp), false);
});

test('GPS: limita escrituras por tiempo y distancia, con heartbeat estacionario', () => {
  const f = fixture();
  const first = f.fix();
  assert.equal(shouldPublishGps(null, first, null, first.timestamp), true);
  f.advance(5_000);
  assert.equal(shouldPublishGps(first, f.fix({ latitude: 18.5 }), first.timestamp, f.fix().timestamp), false);
  f.advance(5_000);
  assert.equal(shouldPublishGps(first, f.fix({ latitude: 18.5 }), first.timestamp, f.fix().timestamp), true);
  assert.equal(shouldPublishGps(first, f.fix(), first.timestamp, f.fix().timestamp), false);
  f.advance(15_000);
  assert.equal(shouldPublishGps(first, f.fix(), first.timestamp, f.fix().timestamp), true);
});

test('Disponible obtiene permiso y GPS real del adaptador antes de publicar y observar', async () => {
  const f = fixture();
  await f.tracker.start();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].start, true);
  assert.deepEqual(f.writes[0].value, f.fix());
  assert.equal(f.tracker.getSnapshot().state, 'tracking');
});

test('permiso denegado o servicios apagados nunca publican coordenadas', async () => {
  for (const overrides of [{ permission: async () => false }, { servicesEnabled: async () => false }]) {
    const f = fixture(overrides);
    await f.tracker.start();
    assert.equal(f.writes.every((write) => write.value === null), true);
    assert.ok(['permission_denied', 'services_disabled'].includes(f.tracker.getSnapshot().state));
  }
});

test('No disponible elimina el watcher y descarta callbacks tardíos', async () => {
  const f = fixture();
  await f.tracker.start();
  await f.tracker.stop();
  const count = f.writes.length;
  f.advance(30_000);
  f.emit(f.fix());
  await f.tracker.tick();
  await flush();
  assert.equal(f.writes.length, count);
  assert.equal(f.writes.at(-1).value, null);
  assert.equal(f.removed(), 1);
  assert.equal(f.tracker.getSnapshot().location, null);
});

test('limpieza de logout y desmontaje es idempotente: una sola baja confirmada', async () => {
  const f = fixture();
  await f.tracker.start();
  await Promise.all([f.tracker.stop(), f.tracker.stop()]);
  await f.tracker.stop();
  assert.equal(f.writes.filter((write) => write.value === null).length, 1);
  assert.equal(f.removed(), 1);
});

test('detener durante el diálogo de permisos evita un inicio tardío', async () => {
  const permission = deferred();
  const f = fixture({ permission: () => permission.promise });
  const starting = f.tracker.start();
  await f.tracker.stop();
  permission.resolve(true);
  await starting;
  assert.equal(f.writes.some((write) => write.value !== null), false);
});

test('detener durante getCurrentPosition evita publicar su resultado tardío', async () => {
  const gps = deferred();
  const f = fixture({ getFix: () => gps.promise });
  const starting = f.tracker.start();
  await flush();
  await f.tracker.stop();
  gps.resolve(f.fix());
  await starting;
  assert.equal(f.writes.some((write) => write.value !== null), false);
});

test('la baja se escribe después de un inicio ya enviado, sin dejarlo disponible', async () => {
  const pending = deferred();
  const order = [];
  const f = fixture({ publish: async (value) => {
    if (value) { order.push('online'); await pending.promise; }
    else order.push('offline');
  } });
  const starting = f.tracker.start();
  await flush();
  const stopping = f.tracker.stop('paused');
  assert.equal(f.tracker.getSnapshot().state, 'paused');
  pending.resolve();
  await Promise.all([starting, stopping]);
  assert.deepEqual(order, ['online', 'offline']);
});

test('un watcher resuelto después de detener se elimina inmediatamente', async () => {
  const watcher = deferred();
  let removed = false;
  const f = fixture({ watch: () => watcher.promise });
  const starting = f.tracker.start();
  await flush();
  await f.tracker.stop();
  watcher.resolve({ remove: () => { removed = true; } });
  await starting;
  assert.equal(removed, true);
});

test('el heartbeat obtiene una lectura nueva aunque el vehículo esté estacionado', async () => {
  const f = fixture();
  await f.tracker.start();
  f.advance(25_000);
  await f.tracker.tick();
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].value.timestamp, f.fix().timestamp);
  assert.equal(f.writes[1].start, false);
});

test('revocar permiso o apagar GPS durante el seguimiento detiene la publicación', async () => {
  for (const [adapter, expected] of [['permission', 'permission_denied'], ['servicesEnabled', 'services_disabled']]) {
    let allowed = true;
    const f = fixture({ [adapter]: async () => allowed });
    await f.tracker.start();
    allowed = false;
    await f.tracker.tick();
    assert.equal(f.tracker.getSnapshot().state, expected);
    assert.equal(f.writes.at(-1).value, null);
    assert.equal(f.removed(), 1);
  }
});

test('errores del sensor y lecturas imprecisas pasan a No disponible, no inventan GPS', async () => {
  const f = fixture({ getFix: async () => ({ latitude: 18, longitude: -66, timestamp: 0, accuracy: 900 }) });
  await f.tracker.start();
  assert.equal(f.tracker.getSnapshot().state, 'error');
  assert.equal(f.writes.every((write) => write.value === null), true);
  const watched = fixture();
  await watched.tracker.start();
  watched.fail('sensor desactivado');
  await flush();
  assert.equal(watched.tracker.getSnapshot().state, 'error');
  assert.equal(watched.removed(), 1);
});

test('desconexión: backoff acotado, no cola de puntos y recuperación con GPS actual', async () => {
  let offline = false;
  const published = [];
  const f = fixture({ publish: async (value) => {
    if (offline && value) throw new Error('sin red');
    published.push(value);
  } });
  await f.tracker.start();
  offline = true;
  f.advance(25_000);
  await f.tracker.tick();
  assert.equal(f.tracker.getSnapshot().state, 'disconnected');
  assert.equal(f.tracker.getSnapshot().enabled, true, 'El control debe permitir detener los reintentos.');
  const count = published.length;
  f.advance(5_000);
  await f.tracker.tick();
  assert.equal(published.length, count);
  offline = false;
  f.advance(10_000);
  await f.tracker.tick();
  assert.equal(f.tracker.getSnapshot().state, 'tracking');
  assert.equal(published.at(-1).timestamp, f.fix().timestamp);
});

test('el conductor puede detener los reintentos tras perder conexión', async () => {
  let offline = false;
  const f = fixture({ publish: async (value) => { if (offline && value) throw new Error('sin red'); } });
  await f.tracker.start();
  offline = true;
  f.advance(25_000);
  await f.tracker.tick();
  await f.tracker.stop();
  assert.equal(f.tracker.getSnapshot().enabled, false);
  assert.equal(f.tracker.getSnapshot().state, 'offline');
  f.advance(60_000);
  await f.tracker.tick();
  assert.equal(f.tracker.getSnapshot().state, 'offline');
});

test('GPS puede volver a iniciarse tras una baja sin reutilizar la lectura anterior', async () => {
  const f = fixture();
  await f.tracker.start();
  await f.tracker.stop('paused');
  f.advance(60_000);
  await f.tracker.start();
  assert.equal(f.writes.at(-1).start, true);
  assert.equal(f.writes.at(-1).value.timestamp, f.fix().timestamp);
  assert.equal(f.tracker.getSnapshot().state, 'tracking');
});

test('baja sin red conserva estado local detenido y advierte que la baja remota no se confirmó', async () => {
  const f = fixture({ publish: async () => { throw new Error('sin red'); } });
  await f.tracker.stop();
  assert.equal(f.tracker.getSnapshot().state, 'offline');
  assert.match(f.tracker.getSnapshot().message, /[Nn]o pudimos confirmar/);
});

test('una nueva activación espera la baja de la publicación anterior todavía en vuelo', async () => {
  const pending = deferred();
  const order = [];
  const f = fixture({ publish: async (value) => {
    order.push(value ? 'online' : 'offline');
    if (order.length === 1) await pending.promise;
  } });
  const first = f.tracker.start();
  await flush();
  const stopping = f.tracker.stop();
  const second = f.tracker.start();
  await flush();
  pending.resolve();
  await Promise.all([first, stopping, second]);
  assert.deepEqual(order, ['online', 'offline', 'online']);
  assert.equal(f.tracker.getSnapshot().state, 'tracking');
});

test('rechazo de autorización 42501 detiene el GPS en vez de reintentar escrituras prohibidas', async () => {
  let rejected = false;
  const writes = [];
  const f = fixture({ publish: async (value) => {
    if (rejected && value) throw Object.assign(new Error('sin aprobación'), { code: '42501' });
    writes.push(value);
  } });
  await f.tracker.start();
  rejected = true;
  f.advance(25_000);
  await f.tracker.tick();
  assert.equal(f.tracker.getSnapshot().state, 'error');
  assert.equal(f.tracker.getSnapshot().enabled, false);
  assert.equal(writes.at(-1), null);
  assert.equal(f.removed(), 1);
});

test('frescura: desconexión, offline, fecha ausente, futura y obsoleta no se muestran como actuales', () => {
  const now = 1_800_000_000_000;
  const recent = new Date(now - 1_000).toISOString();
  assert.equal(locationFreshness(recent, true, true, now), 'fresh');
  assert.equal(locationFreshness(recent, true, false, now), 'disconnected');
  assert.equal(locationFreshness(recent, false, true, now), 'offline');
  for (const stamp of [null, 'invalid', new Date(now - 45_001).toISOString(), new Date(now + 10_001).toISOString()]) {
    assert.equal(locationFreshness(stamp, true, true, now), 'stale');
  }
});

test('autorización SQL: ubicación limitada al pasajero asignado y viajes activos; sin driver_id de escritura', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20261108020000_driver_foreground_presence.sql', import.meta.url), 'utf8');
  assert.match(sql, /t\.id = p_trip_id and t\.passenger_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /t\.status::text in \('accepted','arrived','in_progress'\)/);
  assert.match(sql, /v_uid uuid := auth\.uid\(\)/);
  assert.match(sql, /where id = v_uid for update/);
  assert.match(sql, /role = 'conductor'/);
  assert.match(sql, /alter policy authenticated_drivers_update_safe_runtime_fields on public\.drivers[\s\S]*?p\.role = 'conductor'/);
  assert.match(sql, /alter policy authenticated_drivers_insert_pending_record on public\.drivers[\s\S]*?p\.role = 'conductor'/);
  assert.match(sql, /location_updated_at > clock_timestamp\(\) - interval '45 seconds'/);
  assert.match(sql, /revoke all on function public\.get_assigned_driver_location\(uuid\) from public, anon/);
  assert.doesNotMatch(sql, /disable row level security|delete from|truncate /i);
});

test('integración: logout se limpia antes de perder sesión; pasajero no publica ni carga todos los conductores', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const auth = read('../src/context/AuthContext.tsx');
  const logout = auth.slice(auth.indexOf('signOut: async'), auth.indexOf('expireSession: async'));
  assert.ok(logout.indexOf('Promise.allSettled') < logout.indexOf('setSession(null)'));
  const passenger = read('../../../artifacts/dame-pon-pasajero/hooks/useAssignedDriverPresence.ts');
  assert.match(passenger, /assignedTripScope\(userId, trip\)/);
  assert.match(passenger, /next\?\.driver_id === driverId/);
  assert.match(passenger, /loadedScope === scope/);
  assert.match(passenger, /freshness === 'fresh'/);
  assert.doesNotMatch(passenger, /publishDriverPresence|updateDriverLocation|\.from\('drivers'\)/);
});

test('ámbito del pasajero: únicamente SU viaje asignado activo; cambia al cambiar identidad, viaje o conductor', () => {
  const trip = { id: 'trip-a', passenger_id: 'passenger-a', driver_id: 'driver-a', status: 'accepted' };
  const scope = assignedTripScope('passenger-a', trip);
  assert.deepEqual(scope, { tripId: 'trip-a', driverId: 'driver-a', key: 'passenger-a:trip-a:driver-a' });
  for (const status of ['arrived', 'in_progress']) assert.ok(assignedTripScope('passenger-a', { ...trip, status }));
  for (const status of ['requested', 'offered', 'completed', 'cancelled']) {
    assert.equal(assignedTripScope('passenger-a', { ...trip, status }), null);
  }
  assert.equal(assignedTripScope('other-passenger', trip), null);
  assert.equal(assignedTripScope(undefined, trip), null);
  assert.equal(assignedTripScope('passenger-a', { ...trip, driver_id: null }), null);
  assert.equal(assignedTripScope('passenger-a', null), null);
  assert.notEqual(assignedTripScope('passenger-a', { ...trip, id: 'trip-b' }).key, scope.key);
  assert.notEqual(assignedTripScope('passenger-a', { ...trip, driver_id: 'driver-b' }).key, scope.key);
});
