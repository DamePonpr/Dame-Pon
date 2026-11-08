// No DATABASE_URL, Supabase URL, API key or environment credentials are read.
// SQL is executed only in an initdb-created disposable cluster, Unix socket,
// TCP DISABLED. Fail if the local PostgreSQL tools are absent; never fall back.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'gps-pg-'));
const env = { PATH: process.env.PATH, HOME: dir, LC_ALL: 'C' };
const pgArgs = ['-X', '-q', '-A', '-t', '-h', dir, '-p', '55439', '-U', 'gps_test_owner', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const migration = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const D1 = '00000000-0000-0000-0000-000000000001';
const D2 = '00000000-0000-0000-0000-000000000002';
const P1 = '00000000-0000-0000-0000-000000000003';
const P2 = '00000000-0000-0000-0000-000000000004';
const T1 = '00000000-0000-0000-0000-000000000011';
const T2 = '00000000-0000-0000-0000-000000000012';
let running = false;
function run(command, args, input = '') {
  const result = spawnSync(command, args, { env, input, encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`${command}: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
const sql = (query) => run('psql', pgArgs, query);
function authenticated(user, query, session = 'auth-a') {
  return `set request.jwt.claims='${JSON.stringify({ sub: user, session_id: session })}'; set role authenticated;\n${query}`;
}
const as = (user, query, session) => sql(authenticated(user, query, session));
function denied(user, query, code = '42501', session) {
  assert.throws(() => as(user, query, session), new RegExp(code));
}
function open(user = D1, sid = 'auth-a') {
  sql(`update public.driver_presence_control set last_opened_at=clock_timestamp()-interval '3 seconds' where driver_id='${user}'`);
  return as(user, 'select public.open_driver_presence_session()', sid);
}
const publishSql = (id, seq = 1, online = true) =>
  `select public.publish_driver_presence('${id}',${seq},${online},18.4,-66.1,clock_timestamp());`;
const publish = (id, seq = 1, online = true, user = D1, sid = 'auth-a') => as(user, publishSql(id, seq, online), sid);
function trip(id = T1, status = 'requested', driver = null) {
  sql(`insert into public.trips(id,passenger_id,driver_id,status)
    values('${id}','${P1}',${driver ? `'${driver}'` : 'null'},'${status}')`);
}
const presence = (user = P1, id = T1) => JSON.parse(as(user,
  `select row_to_json(p) from public.get_assigned_driver_location('${id}') p`) || 'null');
function concurrent(query) {
  return new Promise((resolve) => {
    const child = spawn('psql', pgArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr: String(error) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(query);
  });
}
before(() => {
  run('initdb', ['-D', join(dir, 'data'), '-U', 'gps_test_owner', '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-o',
    `-k ${dir} -h '' -p 55439 -c wal_level=logical -c max_connections=12`, '-w', 'start']);
  running = true;
  sql(readFileSync(new URL('./fixtures/gps-baseline.sql', import.meta.url), 'utf8'));
  // Use the existing RPC definitions verbatim, NOT simplified replacements.
  const historical = migration('20260920120000_openride_adoption_layer_a1.sql');
  sql(historical.match(/create type public\.openride_trip_result as \([\s\S]*?\n    \);/)[0]);
  sql(historical.match(/create unique index if not exists trips_one_openride_active_per_driver[\s\S]*?;/)[0]);
  for (const name of ['accept_trip', 'start_trip', 'complete_trip', 'cancel_trip']) {
    const definition = historical.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0];
    sql(definition);
  }
  sql(`revoke all on function public.accept_trip(uuid),public.start_trip(uuid,text),
    public.complete_trip(uuid),public.cancel_trip(uuid,text) from public;
    grant execute on function public.accept_trip(uuid),public.start_trip(uuid,text),
    public.complete_trip(uuid),public.cancel_trip(uuid,text) to authenticated`);
  // Atomic execution of each prepared file, in the local cluster ONLY.
  sql(`begin;\n${migration('20261108020000_driver_foreground_presence.sql')}\ncommit;`);
  sql(`begin;\n${migration('20261108021000_driver_gps_rollout.sql')}\ncommit;`);
});
after(() => {
  if (running) run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  sql(`truncate public.driver_presence_sessions,public.driver_presence_control,public.driver_gps_cohorts,
    public.trips,public.drivers,public.profiles,public.municipios cascade;
    update public.driver_gps_rollout set enforce_fresh_gps=false;
    insert into public.profiles values ('${D1}','conductor'),('${D2}','conductor'),('${P1}','pasajero'),('${P2}','pasajero');
    insert into public.municipios values('Ponce');
    insert into public.drivers(id,license_number,review_notes,approval_status,status,status_kind,is_online,municipio_base)
      values ('${D1}','PRIVATE-LICENSE','PRIVATE-REVIEW','approved','aprobado','online',true,'Ponce'),
             ('${D2}','OTHER-LICENSE','OTHER-REVIEW','approved','aprobado','online',true,'Ponce');`);
});

test('expansión conserva los dos conductores legacy online sin GPS, con compuerta apagada', () => {
  assert.equal(sql('select enforce_fresh_gps from public.driver_gps_rollout'), 'f');
  assert.equal(sql('select count(*) from public.drivers where is_online and location_updated_at is null'), '2');
  trip();
  assert.equal(as(D1, 'select count(*) from public.trips'), '1');
  as(D1, `select id from public.accept_trip('${T1}')`);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`), 'on_trip');
});
test('REST equivalente: SELECT * pasajero no ve filas privadas; dueño conductor conserva su perfil', () => {
  trip(T1, 'accepted', D1);
  assert.equal(as(P1, 'select row_to_json(d) from public.drivers d'), '');
  sql(`update public.trips set status='aceptado' where id='${T1}'`);
  assert.equal(as(P1, 'select row_to_json(d) from public.drivers d'), '');
  assert.equal(as(P2, 'select row_to_json(d) from public.drivers d'), '');
  const own = JSON.parse(as(D1, 'select row_to_json(d) from public.drivers d'));
  assert.equal(own.license_number, 'PRIVATE-LICENSE');
  assert.equal(own.review_notes, 'PRIVATE-REVIEW');
  assert.equal(as(D2, `select count(*) from public.drivers where id='${D1}'`), '0');
});
test('drivers y tablas del protocolo no están publicadas a Realtime', () => {
  assert.equal(sql(`select count(*) from pg_publication_tables where pubname='supabase_realtime'
    and tablename in ('drivers','driver_presence_control','driver_presence_sessions','driver_gps_rollout','driver_gps_cohorts')`), '0');
  assert.equal(sql(`select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='trips'`), '1');
});
test('tablas privadas y compuerta inaccesibles por REST para ambos roles y anon', () => {
  for (const table of ['driver_presence_control','driver_presence_sessions','driver_gps_rollout','driver_gps_cohorts']) {
    for (const user of [D1,P1]) denied(user, `select * from public.${table}`);
    assert.throws(() => sql(`set role anon; select * from public.${table}`), /42501/);
  }
  denied(D1, 'update public.driver_gps_rollout set enforce_fresh_gps=true');
});
test('RPC mínima: únicamente pasajero asignado activo, nunca licencia/notas', () => {
  const session = open(); publish(session); trip(T1, 'accepted', D1);
  const record = presence();
  assert.deepEqual(Object.keys(record).sort(), ['driver_id','is_online','latitude','location_updated_at','longitude']);
  assert.equal(record.latitude, 18.4);
  assert.equal(presence(P2), null);
  assert.equal(presence(D1), null);
  assert.throws(() => sql(`set role anon; select * from public.get_assigned_driver_location('${T1}')`), /42501/);
});
test('RPC no devuelve coordenadas vencidas, futuras u offline aunque se consulte directamente', () => {
  const session = open(); publish(session); trip(T1, 'accepted', D1);
  for (const value of ["clock_timestamp()-interval '46 seconds'", "clock_timestamp()+interval '30 seconds'", 'null']) {
    sql(`update public.drivers set location_updated_at=${value} where id='${D1}'`);
    assert.equal(presence().latitude, null);
    assert.equal(presence().longitude, null);
  }
  sql(`update public.drivers set location_updated_at=clock_timestamp() where id='${D1}';
    update public.driver_presence_sessions set last_observed_at=clock_timestamp()-interval '46 seconds' where id='${session}'`);
  assert.equal(presence().latitude,null,'Una recepción nueva no rejuvenece una muestra vencida');
  assert.ok(Date.now()-Date.parse(presence().location_updated_at)>=45_000);
  sql(`update public.drivers set location_updated_at=clock_timestamp(),is_online=false where id='${D1}'`);
  assert.equal(presence().latitude, null);
});
test('al terminar o cancelar se retira también la lectura directa de la RPC', () => {
  const session = open(); publish(session); trip(T1, 'accepted', D1);
  for (const status of ['completed','cancelled','completado','cancelado']) {
    sql(`update public.trips set status='${status}' where id='${T1}'`);
    assert.equal(presence(), null);
  }
});
test('pasajero/otro conductor no publican GPS ajeno ni alteran la fecha de servidor', () => {
  const session = open(); publish(session); trip(T1,'accepted',D1);
  denied(P1, publishSql(session));
  denied(D2, publishSql(session));
  assert.equal(as(P1, `update public.drivers set current_lat=0 where id='${D1}' returning id`), '');
  denied(D1, 'update public.drivers set location_updated_at=clock_timestamp()');
  denied(P1, 'select public.open_driver_presence_session()');
});
test('anon, conductor sin aprobación y claims sin session_id no pueden abrir/publicar GPS', () => {
  assert.throws(() => sql('set role anon; select public.open_driver_presence_session()'), /42501/);
  denied(D1, 'select public.open_driver_presence_session()', '42501', '');
  sql(`update public.drivers set approval_status='pending_documents',is_online=false where id='${D1}'`);
  denied(D1, 'select public.open_driver_presence_session()');
  const d3 = '00000000-0000-0000-0000-000000000005';
  sql(`insert into public.profiles values('${d3}','conductor')`);
  denied(d3, `insert into public.drivers(id,municipio_base,location_updated_at)
    values('${d3}','Ponce',clock_timestamp())`);
});
test('valores no finitos/rango/muestra antigua no activan presencia ni mueven coordenadas', () => {
  const session = open();
  for (const [lat,lng,date] of [
    ["'NaN'","-66.1",'clock_timestamp()'], ['91','-66.1','clock_timestamp()'],
    ['18.4',"'Infinity'",'clock_timestamp()'], ['18.4','-66.1',"clock_timestamp()-interval '21 seconds'"],
    ['18.4','-66.1',"clock_timestamp()+interval '11 seconds'"],
  ]) {
    denied(D1,`select public.publish_driver_presence('${session}',1,true,${lat},${lng},${date})`,'22023');
  }
  assert.equal(sql(`select activated from public.driver_presence_sessions where id='${session}'`),'f');
  assert.equal(sql(`select location_updated_at is null from public.drivers where id='${D1}'`),'t');
});
test('límite servidor acota muestras y reservas nuevas sin permitir reproducir secuencias', () => {
  const session = open(); publish(session);
  const stamp = sql(`select location_updated_at from public.drivers where id='${D1}'`);
  publish(session,2);
  assert.equal(sql(`select location_updated_at from public.drivers where id='${D1}'`),stamp);
  assert.equal(sql(`select last_sequence from public.driver_presence_sessions where id='${session}'`),'2');
  sql(`update public.driver_presence_control set last_opened_at=clock_timestamp() where driver_id='${D1}'`);
  denied(D1,'select public.open_driver_presence_session()','22023');
});
test('escritura legacy propia sigue permitida, pero invalida el timestamp GPS', () => {
  const session = open(); publish(session);
  as(D1, `update public.drivers set current_lat=18.5 where id='${D1}'`);
  assert.equal(sql(`select location_updated_at is null from public.drivers where id='${D1}'`), 't');
});
test('secuencia descendente, repetida o muestra anterior no cambia ubicación', () => {
  const session = open(); publish(session, 3);
  denied(D1, publishSql(session, 2)); denied(D1, publishSql(session, 3));
  assert.equal(sql(`select last_sequence from public.driver_presence_sessions where id='${session}'`), '3');
  denied(D1, `select public.publish_driver_presence('${session}',4,true,19,-67,clock_timestamp()-interval '1 second')`, '22023');
});
test('Offline revoca definitivamente la sesión, incluso antes de su primer GPS', () => {
  for (const activate of [false,true]) {
    const session = open();
    if (activate) publish(session);
    publish(session, 9, false);
    denied(D1, publishSql(session, 10));
    assert.equal(sql(`select revoked from public.driver_presence_sessions where id='${session}'`), 't');
  }
});
test('sesión autenticada distinta no puede reutilizar el token GPS del mismo conductor', () => {
  const session = open(); publish(session);
  denied(D1, publishSql(session, 2), '42501', 'auth-b');
  denied(D1, publishSql(session, 3, false), '42501', 'auth-b');
});
test('otra generación controla GPS: publicación/baja antigua no afectan la nueva', () => {
  const old = open(); publish(old);
  const current = open(D1,'auth-b'); publish(current,1,true,D1,'auth-b');
  denied(D1,publishSql(old,2));
  publish(old,3,false);
  assert.equal(sql(`select is_online from public.drivers where id='${D1}'`), 't');
  assert.equal(sql(`select current_session_id from public.driver_presence_control where driver_id='${D1}'`), current);
});
test('reserva antigua no activada no puede reemplazar una generación más nueva', () => {
  const delayed = open();
  const current = open(D1,'auth-b'); publish(current,1,true,D1,'auth-b');
  denied(D1,publishSql(delayed,1));
});
test('compuerta por conductor bloquea solo ese cliente legacy; global bloquea ambos', () => {
  trip();
  sql(`insert into public.driver_gps_cohorts values('${D1}',true)`);
  assert.equal(as(D1,'select count(*) from public.trips'), '0');
  denied(D1,`select * from public.accept_trip('${T1}')`);
  assert.equal(as(D2,'select count(*) from public.trips'), '1');
  sql('update public.driver_gps_rollout set enforce_fresh_gps=true');
  assert.equal(as(D2,'select count(*) from public.trips'), '0');
});
test('configuración ausente falla cerrada; no desactiva silenciosamente la frescura', () => {
  trip();
  const result = sql(`begin; delete from public.driver_gps_rollout;
    ${authenticated(D1,'select public.can_driver_read_open_requests();')}
    reset role; rollback;`);
  assert.equal(result,'f');
  assert.equal(sql('select enforce_fresh_gps from public.driver_gps_rollout'),'f');
});
test('GPS vencido bloquea aceptar, pero rollback correctivo conserva filas y operación legacy', () => {
  const session = open(); publish(session); trip();
  sql(`update public.drivers set location_updated_at=clock_timestamp()-interval '46 seconds' where id='${D1}';
    update public.driver_gps_rollout set enforce_fresh_gps=true;
    insert into public.driver_gps_cohorts values('${D1}',true)`);
  denied(D1,`select id from public.accept_trip('${T1}')`);
  const before = sql('select count(*) from public.driver_presence_sessions');
  sql(readFileSync(new URL('../../../docs/sql/phase-2-gps-disable-enforcement.sql',import.meta.url),'utf8'));
  assert.equal(sql('select count(*) from public.driver_presence_sessions'),before);
  assert.equal(sql('select count(*) from public.driver_gps_cohorts'),'1');
  as(D1,`select id from public.accept_trip('${T1}')`);
});
test('avisos: RPC solo service_role y únicamente GPS vigente, disponible y no ocupado', () => {
  assert.equal(sql('set role service_role; select count(*) from public.get_fresh_driver_push_targets()'),'0');
  const session = open(); publish(session);
  denied(D1,'select * from public.get_fresh_driver_push_targets()');
  denied(P1,'select * from public.get_fresh_driver_push_targets()');
  assert.throws(()=>sql('set role anon; select * from public.get_fresh_driver_push_targets()'),/42501/);
  assert.equal(sql('set role service_role; select count(*) from public.get_fresh_driver_push_targets()'),'1');
  trip(T1,'accepted',D1);
  assert.equal(sql('set role service_role; select count(*) from public.get_fresh_driver_push_targets()'),'0');
  sql(`update public.trips set status='completed' where id='${T1}'`);
  sql(`update public.drivers set location_updated_at=clock_timestamp()-interval '46 seconds' where id='${D1}'`);
  assert.equal(sql('set role service_role; select count(*) from public.get_fresh_driver_push_targets()'),'0');
});
test('GPS fresco permite aceptar con compuerta; viaje asignado sigue visible offline', () => {
  sql('update public.driver_gps_rollout set enforce_fresh_gps=true');
  const session = open(); publish(session); trip();
  assert.equal(as(D1,'select count(*) from public.trips'), '1');
  as(D1,`select id from public.accept_trip('${T1}')`);
  publish(session,2,false);
  assert.equal(as(D1,`select count(*) from public.trips where id='${T1}'`),'1');
  assert.equal(as(P1,`select count(*) from public.trips where id='${T1}'`),'1');
});
test('complete/cancel restauran disponibilidad en la misma transacción, sin refrescar GPS', () => {
  const session = open(); publish(session); trip();
  const stamp = sql(`select location_updated_at from public.drivers where id='${D1}'`);
  as(D1,`select id from public.accept_trip('${T1}'); select id from public.start_trip('${T1}','1234');
    select id from public.complete_trip('${T1}')`);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`),'online');
  assert.equal(sql(`select location_updated_at from public.drivers where id='${D1}'`),stamp);
  trip(T2); as(D1,`select id from public.accept_trip('${T2}')`);
  as(P1,`select id from public.cancel_trip('${T2}',null)`);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`),'online');
});
test('legacy aceptado/en_curso se considera ocupado; cancelado devuelve online, nunca reconecta offline', () => {
  const session = open(); publish(session); trip(T1,'aceptado',D1);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`),'on_trip');
  assert.equal(presence().latitude,18.4);
  sql(`update public.trips set status='en_curso' where id='${T1}'`);
  publish(session,2,false);
  sql(`update public.trips set status='cancelado' where id='${T1}'`);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`),'offline');
});
test('rollback de transacción de viaje restaura también el estado del conductor', () => {
  trip();
  as(D1,`begin; select id from public.accept_trip('${T1}'); rollback;`);
  assert.equal(sql(`select status_kind from public.drivers where id='${D1}'`),'online');
  assert.equal(sql(`select status from public.trips where id='${T1}'`),'requested');
});
test('simultaneidad real: dos accept_trip no asignan dos viajes al mismo conductor', async () => {
  trip(); trip(T2);
  const results = await Promise.all([T1,T2].map(id=>concurrent(authenticated(D1,`select id from public.accept_trip('${id}')`))));
  assert.equal(results.filter(result=>result.code===0).length,1);
  assert.match(results.find(result=>result.code!==0).stderr,/(42501|23505)/);
  assert.equal(sql(`select count(*) from public.trips where driver_id='${D1}' and status='accepted'`),'1');
});
test('simultaneidad real: Stop vence a un GPS demorado que esperaba el lock', async () => {
  const session = open(); publish(session);
  const stopping = concurrent(authenticated(D1,`set application_name='gps-stop-hold';
    begin; ${publishSql(session,9,false)} select pg_sleep(2); commit;`));
  let holding = false;
  for (let attempt=0;attempt<20;attempt++) {
    holding = sql(`select exists(select 1 from pg_stat_activity
      where application_name='gps-stop-hold' and wait_event='PgSleep')`) === 't';
    if (holding) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(holding,true,'Stop debe haber revocado y mantener el lock antes del GPS retrasado');
  const update = concurrent(authenticated(D1,publishSql(session,10)));
  const [stopResult,updateResult] = await Promise.all([stopping,update]);
  assert.equal(stopResult.code,0);
  assert.notEqual(updateResult.code,0);
  assert.match(updateResult.stderr,/42501/);
  assert.equal(sql(`select is_online from public.drivers where id='${D1}'`),'f');
});

test('publicación ALL TABLES o protocolo GPS previo fallan cerrados sin expansión parcial', () => {
  const database = 'gps_publication_guard';
  sql(`create database ${database}`);
  const q = query=>run('psql',[...pgArgs,'-d',database],query);
  q(readFileSync(new URL('./fixtures/gps-baseline.sql',import.meta.url),'utf8')
    .replace(/^create role .*;$/gm,''));
  q('drop publication supabase_realtime; create publication supabase_realtime for all tables');
  assert.throws(()=>q(`begin;\n${migration('20261108020000_driver_foreground_presence.sql')}\ncommit;`),
    /La publicación Realtime debe usar tablas explícitas/);
  assert.equal(q(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='drivers' and column_name='location_updated_at'`),'0');
  q(`drop publication supabase_realtime; create publication supabase_realtime for table public.drivers;
    create function public.publish_driver_presence(p_online boolean,p_start boolean)
    returns void language sql as 'select null::void'`);
  assert.throws(()=>q(`begin;\n${migration('20261108020000_driver_foreground_presence.sql')}\ncommit;`),
    /Ya existe un protocolo GPS/);
  assert.equal(q(`select count(*) from information_schema.columns
    where table_schema='public' and table_name='drivers' and column_name='location_updated_at'`),'0');
});
