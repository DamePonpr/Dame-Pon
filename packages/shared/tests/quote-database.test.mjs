// LOCAL ONLY: disposable Unix-socket PostgreSQL; environment has NO credentials.
import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'quote-pg-')),env={PATH:process.env.PATH,HOME:dir,LC_ALL:'C'};
const args=['-X','-q','-A','-t','-h',dir,'-p','55438','-U','quote_test_owner','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
function run(cmd,argv,input='') {const r=spawnSync(cmd,argv,{env,input,encoding:'utf8',timeout:30000});if(r.error||r.status!==0)throw Error(r.error??r.stderr);return r.stdout.trim();}
const sql=q=>run('psql',args,q);
const P='00000000-0000-0000-0000-000000000003',P2='00000000-0000-0000-0000-000000000004';
const D='00000000-0000-0000-0000-000000000001',ADMIN='00000000-0000-0000-0000-000000000009';
let ready=false,rule,area;
const as=(id,q,role='authenticated')=>sql(`set request.jwt.claims='{"sub":"${id}","session_id":"local"}';set role ${role};${q}`);
const denied=(id,q,role)=>assert.throws(()=>as(id,q,role),/42501|permission denied/);
const input={origin:{latitude:18.45,longitude:-66.1,address:'Origen local sintético'},
  destination:{latitude:18.44,longitude:-66.09,address:'Destino local sintético'},vehicleType:'sedan'};
const store=(passenger=P)=>as(passenger,`select public.quote_server_store('${passenger}','${JSON.stringify(input)}',
 '${rule}','${area}','${area}',1000000,60000,'${'a'.repeat(64)}',20)->>'id'`,'service_role');
const confirm=(q,p=P,key=q)=>`select public.quote_server_confirm('${p}','${q}','${key}')`;
function parallel(q) {return new Promise(resolve=>{const p=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});let out='',err='';
  p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',e=>resolve({code:-1,out,err:String(e)}));
  p.on('close',code=>resolve({code,out:out.trim(),err}));p.stdin.end(q);});}
before(()=>{
  run('initdb',['-D',join(dir,'data'),'-U','quote_test_owner','-A','trust','--no-locale']);
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -p 55438 -c max_connections=12`,'-w','start']);ready=true;
  sql(readFileSync(new URL('./fixtures/gps-baseline.sql',import.meta.url),'utf8'));
  sql(`alter table public.municipios add column id text unique;`);
  sql(`create table public.vehicles(driver_id uuid,vehicle_type text,status text);`);
  const historical=readFileSync(new URL('../../../supabase/migrations/20260920120000_openride_adoption_layer_a1.sql',import.meta.url),'utf8');
  sql(historical.match(/create type public\.openride_trip_result as \([\s\S]*?\n    \);/)[0]);
  for(const name of ['accept_trip','start_trip','complete_trip','cancel_trip']) sql(historical.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0]);
  sql(`revoke all on function public.accept_trip(uuid),public.start_trip(uuid,text),public.complete_trip(uuid),public.cancel_trip(uuid,text) from public;
    grant execute on function public.accept_trip(uuid),public.start_trip(uuid,text),public.complete_trip(uuid),public.cancel_trip(uuid,text) to authenticated;`);
  for(const name of ['20261108020000_driver_foreground_presence.sql','20261108021000_driver_gps_rollout.sql'])
    sql(`begin;${readFileSync(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8')}commit;`);
  // Same deployed INSERT guard, not a permissive testing substitute.
  sql(historical.match(/create policy "authenticated_passengers_insert_openride_requests"[\s\S]*?\n\);/)[0]);
  for(const name of ['001_quote_schema_and_rpc.sql','002_admin_publish.sql'])
    sql(`begin;${readFileSync(new URL('../../../docs/phase4-drafts/'+name,import.meta.url),'utf8')}commit;`);
});
after(()=>{if(ready)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{
  sql(`truncate public.quote_enforcement_cohorts,public.vehicles,public.ride_quotes,public.commercial_fare_versions,public.quote_area_versions,public.trips,
    public.drivers,public.profiles,public.municipios cascade;
    update public.quote_rollout set require_quotes=true;update public.driver_gps_rollout set enforce_fresh_gps=false;
    insert into public.profiles values('${P}','pasajero'),('${P2}','pasajero'),('${D}','conductor'),('${ADMIN}','admin');
    insert into public.municipios(nombre,id) values('Ponce','Ponce');
    insert into public.drivers(id,approval_status,status,status_kind,is_online) values('${D}','approved','aprobado','online',true);`);
  sql(`insert into public.quote_enforcement_cohorts(passenger_id,enrolled_by,reason) values('${P}','${ADMIN}','SYNTHETIC LOCAL PILOT ONLY')`);
  sql(`insert into public.vehicles values('${D}','sedan','approved')`);
  // Synthetic LOCAL admin and synthetic rates only. Not an application account.
  const policy={commercialApproval:true,municipio_id:null,vehicle_type:'sedan',currency:'USD',algorithm:'fixed-route-v1',
    minimum_policy:'floor_total',night_policy:'explicitly_not_applicable',base_cents:10,per_km_cents:7,per_min_cents:3,minimum_cents:11,
    active_from:'2020-01-01T00:00:00Z',active_to:'2100-01-01T00:00:00Z'};
  rule=as(ADMIN,`select public.publish_commercial_fare_version('${JSON.stringify(policy)}','SYNTHETIC LOCAL TEST ONLY')`);
  area=as(ADMIN,`select public.publish_quote_service_area('Ponce',
    '{"type":"Polygon","coordinates":[[[-67,18],[-65.5,18],[-65.5,18.6],[-67,18.6],[-67,18]]]}',
    '2020-01-01Z','2100-01-01Z','SYNTHETIC LOCAL BOUNDARY ONLY')`);
});
test('RPC de métricas/confirmación solo servidor; no se concede CRUD general',()=>{
  denied(P,'select public.quote_server_context(null)');
  denied(P,`select public.quote_server_confirm('${P}','${P}','${P}')`);
  denied(P,`insert into public.ride_quotes(id) values('${P}')`);
  denied(P,`select public.publish_commercial_fare_version('{}','no autorizado')`);
  denied(P,`update public.quote_rollout set require_quotes=false`);
  denied(P,`delete from public.quote_enforcement_cohorts`);
  denied(P,'select * from public.commercial_fare_versions');
});
test('cotización propia con RLS, sin snapshot privado ni filas del otro pasajero',()=>{
  const q=store();
  assert.equal(as(P,`select total_cents from public.ride_quotes where id='${q}'`),'20');
  assert.equal(as(P2,`select id from public.ride_quotes where id='${q}'`),'');
  denied(P,'select rule_snapshot from public.ride_quotes');
  denied(P,`update public.ride_quotes set total_cents=0 where id='${q}'`);
  denied(P,'select id from public.ride_quotes','anon');
});
test('REST directo no puede publicar viaje con compuerta activa; apagada conserva legacy',()=>{
  denied(P,`insert into public.trips(id,passenger_id,status) values(gen_random_uuid(),'${P}','requested')`);
  // Non-enrolled legacy account stays operational even during the pilot.
  as(P2,`insert into public.trips(id,passenger_id,status) values(gen_random_uuid(),'${P2}','requested')`);
  assert.equal(sql('select count(*) from public.trips'),'1');
  sql('update public.quote_rollout set require_quotes=false');
  as(P,`insert into public.trips(id,passenger_id,status) values(gen_random_uuid(),'${P}','requested')`);
  assert.equal(sql('select count(*) from public.trips'),'2');
});
test('propietario, uso único e idempotencia conservan el mismo viaje',()=>{
  const q=store();
  assert.throws(()=>as(P2,confirm(q,P2),'service_role'),/quote_forbidden/);
  const id=as(P,confirm(q),'service_role');
  assert.equal(as(P,confirm(q),'service_role'),id);
  const q2=store();
  assert.throws(()=>as(P,confirm(q2,P,q),'service_role'),/idempotency_conflict/);
  assert.throws(()=>as(P,confirm(q,P,P2),'service_role'),/quote_used/);
  assert.equal(sql('select count(*) from public.trips'),'1');
  assert.equal(sql(`select fare_estimate from public.trips where id='${id}'`),'0.20000000000000000000');
});
test('caducidad del servidor bloquea confirmar sin crear viaje',()=>{
  const q=store();
  // Test clock fixture only: privileged trigger suspension in disposable cluster.
  sql(`alter table public.ride_quotes disable trigger quote_immutable;
    update public.ride_quotes set created_at=now()-interval '10 minutes',expires_at=now()-interval '1 minute' where id='${q}';
    alter table public.ride_quotes enable trigger quote_immutable;`);
  assert.throws(()=>as(P,confirm(q),'service_role'),/quote_expired/);
  assert.equal(sql('select count(*) from public.trips'),'0');
});
test('concurrencia: dos confirmaciones idénticas producen un solo viaje',async()=>{
  const q=store();
  const query=`set role service_role;${confirm(q)}`;
  const results=await Promise.all([parallel(query),parallel(query)]);
  assert.deepEqual(results.map(r=>r.code),[0,0],JSON.stringify(results));
  assert.equal(results[0].out,results[1].out);
  assert.equal(sql('select count(*) from public.trips'),'1');
});
test('otra clave concurrente no reutiliza cotización consumida',async()=>{
  const q=store();
  const results=await Promise.all([parallel(`set role service_role;${confirm(q)}`),
    parallel(`set role service_role;${confirm(q,P,P2)}`)]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).err,/quote_used/);
});
test('precio y ruta congelados; completar con RPC real no cobra y conserva GPS fase 2',()=>{
  const q=store(),tid=as(P,confirm(q),'service_role');
  assert.throws(()=>sql(`update public.commercial_fare_versions set base_cents=999 where id='${rule}'`),/immutable_commercial_version/);
  assert.throws(()=>sql(`update public.trips set fare_estimate=999 where id='${tid}'`),/immutable_trip_quote/);
  assert.throws(()=>sql(`update public.trips set pickup_lat=18.1 where id='${tid}'`),/immutable_trip_quote/);
  as(D,`select id from public.accept_trip('${tid}')`);
  const pin=sql(`select passenger_pin from public.trips where id='${tid}'`);
  as(D,`select id from public.start_trip('${tid}','${pin}')`);
  as(D,`select id from public.complete_trip('${tid}')`);
  assert.equal(Number(sql(`select fare_final from public.trips where id='${tid}'`)),.2);
  assert.equal(sql(`select coalesce(payment_status::text,'NULL') from public.trips where id='${tid}'`),'NULL');
  assert.equal(sql(`select status_kind from public.drivers where id='${D}'`),'online');
  assert.equal(as(P,'select id from public.drivers'),''); // no private driver row leak
});
test('SQL recalcula importe y rechaza cifra alterada aunque el llamador sea servidor',()=>{
  assert.throws(()=>as(P,`select public.quote_server_store('${P}','${JSON.stringify(input)}',
    '${rule}','${area}','${area}',1000000,60000,'${'a'.repeat(64)}',1)`,'service_role'),/quote_calculation_mismatch/);
  assert.equal(sql('select count(*) from public.ride_quotes'),'0');
});
test('cotización sedan no se acepta con vehículo distinto o no aprobado; legacy sin bloqueo nuevo',()=>{
  const q=store(),tid=as(P,confirm(q),'service_role');
  sql(`update public.vehicles set vehicle_type='suv'`);
  assert.throws(()=>as(D,`select id from public.accept_trip('${tid}')`),/quoted_vehicle_required/);
  sql(`update public.vehicles set vehicle_type='sedan',status='pending'`);
  assert.throws(()=>as(D,`select id from public.accept_trip('${tid}')`),/quoted_vehicle_required/);
  assert.equal(sql(`select status from public.trips where id='${tid}'`),'requested');
});
