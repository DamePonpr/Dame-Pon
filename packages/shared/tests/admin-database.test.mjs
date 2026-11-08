// Isolated LOCAL PostgreSQL only. No real Auth accounts, passwords or remote URLs.
import assert from 'node:assert/strict';
import {before,after,beforeEach,test} from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'admin-pg-')),env={PATH:process.env.PATH,HOME:dir,LC_ALL:'C'};
const args=['-X','-q','-A','-t','-h',dir,'-p','55440','-U','admin_test_owner','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
function run(cmd,argv,input=''){const r=spawnSync(cmd,argv,{env,input,encoding:'utf8',timeout:30000});if(r.error||r.status!==0)throw Error(r.error??r.stderr);return r.stdout.trim();}
const sql=q=>run('psql',args,q),read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const A='00000000-0000-0000-0000-000000000009',P='00000000-0000-0000-0000-000000000003',D='00000000-0000-0000-0000-000000000001';
const V='00000000-0000-0000-0000-000000000021',DOC='00000000-0000-0000-0000-000000000022',I='00000000-0000-0000-0000-000000000023',S='00000000-0000-0000-0000-000000000024';
const as=(actor,q,role='authenticated')=>sql(`set request.jwt.claims='{"sub":"${actor}","session_id":"local-test"}';set role ${role};${q}`);
const denied=(actor,q)=>assert.throws(()=>as(actor,q),/42501|permission denied/);
const action=(section,recordId,verb,rev=0,extra={})=>({section,recordId,action:verb,reason:'MOTIVO SINTÉTICO SOLO LOCAL',expectedRevision:rev,idempotencyKey:crypto.randomUUID(),...extra});
const execute=p=>`select public.admin_console_action('${JSON.stringify(p)}')`;
const open=(rev=0,id=DOC,kind='driver')=>`select public.admin_console_document('${JSON.stringify({id,kind,reason:'INSPECCIÓN SINTÉTICA LOCAL',expectedRevision:rev,idempotencyKey:crypto.randomUUID()})}')`;
let started=false;
before(()=>{
 run('initdb',['-D',join(dir,'data'),'-U','admin_test_owner','-A','trust','--no-locale']);
 run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -p 55440 -c max_connections=12`,'-w','start']);started=true;
 const historical=read('../../../supabase/migrations/20260920120000_openride_adoption_layer_a1.sql');
 sql(`create type public.driver_legacy_test as enum ('pendiente','aprobado','suspendido');`);
 sql(read('./fixtures/gps-baseline.sql')
  .replace("status text not null default 'pendiente'","status public.driver_legacy_test not null default 'pendiente'")
  .replace(/create type public.driver_approval_status as enum \([\s\S]*?\);/,
    historical.match(/create type public.driver_approval_status as enum \([\s\S]*?\);/)[0]));
 sql(historical.match(/create type public\.openride_trip_result as \([\s\S]*?\n    \);/)[0]);
 for(const name of ['accept_trip','start_trip','complete_trip','cancel_trip'])
  sql(historical.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))[0]);
 sql(`revoke all on function public.accept_trip(uuid) from public;grant execute on function public.accept_trip(uuid) to authenticated;`);
 for(const type of ['document_status','driver_document_type','vehicle_document_type','vehicle_status','vehicle_type','incident_category','incident_severity','incident_status','support_case_status','support_case_priority'])
  sql(historical.match(new RegExp(`create type public\\.${type} as enum \\([\\s\\S]*?\\);`))[0]);
 sql(`alter table public.profiles add column full_name text;
  create table public.vehicles(id uuid primary key,driver_id uuid references public.drivers(id),make text,model text,year integer,
   color text,plate text,vin text,vehicle_type public.vehicle_type default 'sedan',status public.vehicle_status default 'pending');
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,
    unique(bucket_id,name));
  create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  grant usage on schema storage to authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;
  alter table storage.objects enable row level security;`);
 for(const name of ['driver_documents','vehicle_documents','incidents','support_cases'])
  sql(historical.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0]);
 sql(`create unique index driver_documents_approved_unique on public.driver_documents(driver_id,doc_type) where status='approved';
  create unique index vehicle_documents_approved_unique on public.vehicle_documents(vehicle_id,doc_type) where status='approved';
  create table public.driver_agreement_acceptances(driver_id uuid,agreement_key text,version text);
  create table public.fare_rules(id uuid primary key,nombre text,base_cents integer,per_km_cents integer,per_min_cents integer,
   minimum_cents integer,night_surcharge_pct integer);
  grant select,insert,update,delete on public.vehicles,public.driver_documents,public.vehicle_documents,public.incidents,public.support_cases to authenticated;
  alter table public.vehicles enable row level security;
  create policy vehicle_own on public.vehicles for all to authenticated using(driver_id=auth.uid() or public.is_admin()) with check(driver_id=auth.uid() or public.is_admin());`);
 for(const name of ['driver_documents','vehicle_documents','incidents','support_cases']){
  sql(`alter table public.${name} enable row level security;
   create policy administrative_write on public.${name} for all to authenticated using(public.is_admin()) with check(public.is_admin());`);
 }
 sql(`create policy driver_documents_owner_read on public.driver_documents for select to authenticated using(driver_id=auth.uid());`);
 sql(read('../../../supabase/migrations/20260920130000_driver_document_review_b.sql'));
 sql(read('../../../supabase/migrations/20260920130100_driver_document_review_b_policies.sql'));
 sql(read('../../../supabase/migrations/20260922100000_driver_onboarding_document_types.sql'));
 for(const name of ['20261108020000_driver_foreground_presence.sql','20261108021000_driver_gps_rollout.sql'])
  sql(`begin;${read('../../../supabase/migrations/'+name)}commit;`);
 for(const name of ['001_admin_foundation.sql','002_admin_reads.sql','003_admin_actions.sql','004_admin_assignment_race.sql'])
  sql(read('../../../docs/phase5-drafts/'+name));
});
after(()=>{if(started)run('pg_ctl',['-D',join(dir,'data'),'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true});});
beforeEach(()=>{
 sql(`truncate public.admin_document_tickets,public.admin_console_audit,public.driver_documents,public.vehicle_documents,
  public.incidents,public.support_cases,public.trips,public.vehicles,public.drivers,public.profiles,public.fare_rules,storage.objects cascade;
  insert into public.profiles(id,role,full_name) values('${A}','admin','Identidad RLS sintética'),('${P}','pasajero','Pasajero sintético'),('${D}','conductor','Conductor sintético');
  insert into public.drivers(id,municipio_base,license_number) values('${D}','Ponce','PRIVADO-NO-EXPOSICIÓN');
  insert into public.vehicles(id,driver_id,make,model,year,color,plate,vin) values('${V}','${D}','Marca sintética','Modelo',2020,'Azul','SINTETICO','PRIVADO-VIN');
  insert into public.driver_documents(id,driver_id,doc_type,storage_path,status) values('${DOC}','${D}','license_front','${D}/license.jpg','submitted');
  insert into storage.objects(bucket_id,name,metadata) values('driver-documents','${D}/license.jpg','{"mimetype":"image/jpeg"}');
  insert into public.incidents(id,reported_by,category,description) values('${I}','${P}','safety','Incidente de prueba local');
  insert into public.support_cases(id,subject,opened_by) values('${S}','Caso sintético','${P}');`);
});
test('API RPC y RLS: anon, pasajero y conductor no administran ni consultan otras identidades',()=>{
 for(const actor of [P,D]){
  denied(actor,'select public.admin_console_session()');
  denied(actor,"select public.admin_console_list('drivers')");
  denied(actor,execute(action('drivers',D,'approve')));
  denied(actor,open());
  assert.equal(as(actor,'select id from public.admin_console_audit'),'');
 }
 assert.throws(()=>as(P,'select public.admin_console_session()','anon'),/permission denied/);
 assert.throws(()=>as(A,'select public.admin_console_session()','service_role'),/permission denied/);
 assert.equal(as(P,`select license_number from public.drivers where id='${D}'`),'');
 assert.equal(JSON.parse(as(A,'select public.admin_console_session()')).role,'admin');
});
test('vista mínima de viajes, tarifas sin escritura ni PIN, coordenadas o identificación privada',()=>{
 sql(`insert into public.trips(id,passenger_id,status,pickup_lat,pickup_lng,passenger_pin) values(gen_random_uuid(),'${P}','requested',18.4,-66.1,'9876')`);
 const text=as(A,"select public.admin_console_list('trips')")+as(A,"select public.admin_console_detail('drivers','"+D+"')");
 for(const value of ['license_number','PRIVADO-NO-EXPOSICIÓN','current_lat','pickup_lat','passenger_pin','9876','storage_path','PRIVADO-VIN'])
  assert.equal(text.includes(value),false,value);
 denied(A,execute(action('pricing',V,'approve')));
 denied(A,"update public.fare_rules set base_cents=1");
});
test('documentos: sin ticket ni pasajero ajeno, lectura propia conservada y ticket admin efímero auditado',()=>{
 assert.equal(as(A,"select name from storage.objects"),'');
 assert.equal(as(P,"select name from storage.objects"),'');
 assert.equal(as(D,"select name from storage.objects"),D+'/license.jpg');
 as(A,open());
 assert.equal(as(A,"select name from storage.objects"),D+'/license.jpg');
 assert.equal(as(P,"select name from storage.objects"),'');
 denied(A,'select evidence_path from public.admin_console_audit');
 sql(`update public.admin_document_tickets set expires_at=clock_timestamp()-interval '1 second'`);
 assert.equal(as(A,"select name from storage.objects"),'');
 assert.equal(sql("select count(*) from public.admin_console_audit where action='open'"),'1');
});
test('la evidencia no se sobrescribe ni borra; paths ajenos o travesía nunca producen ticket',()=>{
 assert.equal(as(D,`update storage.objects set metadata='{}' returning name`),'');
 assert.equal(sql(`select metadata->>'mimetype' from storage.objects`),'image/jpeg');
 assert.equal(as(D,'delete from storage.objects returning name'),'');
 sql(`update public.driver_documents set storage_path='${P}/secreto.jpg' where id='${DOC}'`);
 assert.throws(()=>as(A,open(1)),/document_path_unsafe/);
 sql(`update public.driver_documents set storage_path='${D}/../otro.jpg' where id='${DOC}'`);
 assert.throws(()=>as(A,open(2)),/document_path_unsafe/);
 assert.equal(sql('select count(*) from public.admin_document_tickets'),'0');
});
test('aprobación documental exige apertura de esa revisión; autoría y auditoría inmutables',()=>{
 assert.throws(()=>as(A,execute(action('documents',DOC,'approve',0,{documentKind:'driver'}))),/document_packet_incomplete/);
 as(A,open());
 const p=action('documents',DOC,'approve',0,{documentKind:'driver'});
 const result=as(A,execute(p));assert.equal(as(A,execute(p)),result);
 assert.equal(sql(`select status from public.driver_documents where id='${DOC}'`),'approved');
 assert.equal(sql(`select reviewer_id from public.driver_documents where id='${DOC}'`),A);
 denied(A,`update public.driver_documents set status='rejected' where id='${DOC}'`);
 assert.equal(as(D,`update public.driver_documents set status='approved' where id='${DOC}' returning id`),'');
 assert.throws(()=>sql("delete from public.admin_console_audit"),/immutable_admin_audit/);
});
test('revisión obsoleta, duplicación y cambio de payload no alteran decisiones',()=>{
 const p=action('incidents',I,'triage');
 const a=as(A,execute(p));assert.equal(as(A,execute(p)),a);
 assert.throws(()=>as(A,execute({...p,reason:'MOTIVO DISTINTO LOCAL'})),/idempotency_conflict/);
 assert.throws(()=>as(A,execute(action('incidents',I,'review'))),/revision_conflict/);
 assert.equal(sql(`select status from public.incidents where id='${I}'`),'triaged');
 assert.equal(sql("select count(*) from public.admin_console_audit"),'1');
});
test('casos: asignación válida, motivo, resolución/reapertura y bloqueo de REST directo',()=>{
 assert.throws(()=>as(A,execute(action('support',S,'assign',0,{assigneeId:P}))),/assignee_not_admin/);
 as(A,execute(action('support',S,'assign',0,{assigneeId:A})));
 as(A,execute(action('support',S,'resolve',1)));
 as(A,execute(action('support',S,'close',2)));
 as(A,execute(action('support',S,'reopen',3)));
 assert.equal(sql(`select status from public.support_cases where id='${S}'`),'open');
 denied(A,`update public.support_cases set status='closed'`);
 assert.equal(sql('select count(*) from public.admin_console_audit'),'4');
});
test('no aprobar conductor sin paquete completo; suspender no toca roles/docs y no corta viaje activo',()=>{
 assert.throws(()=>as(A,execute(action('drivers',D,'approve'))),/document_packet_incomplete/);
 sql(`update public.drivers set approval_status='approved',status='aprobado',is_online=true,status_kind='online' where id='${D}'`);
 sql(`insert into public.trips(id,passenger_id,driver_id,status) values(gen_random_uuid(),'${P}','${D}','accepted')`);
 const revision=Number(sql(`select admin_revision from public.drivers where id='${D}'`));
 assert.throws(()=>as(A,execute(action('drivers',D,'suspend',revision))),/driver_has_active_trip/);
 sql("update public.trips set status='cancelled'");
 as(A,execute(action('drivers',D,'suspend',Number(sql(`select admin_revision from public.drivers where id='${D}'`)))));
 assert.equal(sql(`select approval_status||':'||status||':'||is_online from public.drivers where id='${D}'`),'suspended:suspendido:false');
 assert.equal(sql(`select role from public.profiles where id='${D}'`),'conductor');
 assert.equal(sql('select count(*) from public.driver_documents'),'1');
});
test('vehículo fuera de servicio suspende disponibilidad sin cambiar tarifas o documentos',()=>{
 sql(`update public.drivers set approval_status='approved',status='aprobado' where id='${D}'`);
 as(A,execute(action('vehicles',V,'out_of_service')));
 assert.equal(sql(`select status from public.vehicles where id='${V}'`),'out_of_service');
 assert.equal(sql(`select approval_status from public.drivers where id='${D}'`),'suspended');
 assert.equal(sql('select count(*) from public.driver_documents'),'1');
 assert.equal(sql(`select count(*) from public.admin_console_audit where section='drivers' and action='suspend_vehicle_unavailable'`),'1');
});
test('paquete válido: activa vehículo y aprueba conductor sin darlo de alta online ni cambiar roles',()=>{
 const driverTypes=['photo','ntsp_certificate_1','ntsp_certificate_2','conduct_certificate_1','conduct_certificate_2'];
 const vehicleTypes=['registration','insurance','vehicle_front','vehicle_rear','vehicle_left','vehicle_right','vehicle_interior','vin','door_label','inspection'];
 for(const type of driverTypes)sql(`insert into public.driver_documents(driver_id,doc_type,storage_path,status)
  values('${D}','${type}','${D}/${type}.jpg','approved')`);
 for(const type of vehicleTypes)sql(`insert into public.vehicle_documents(vehicle_id,doc_type,storage_path,status)
  values('${V}','${type}','${D}/${type}.jpg','approved')`);
 sql(`insert into storage.objects(bucket_id,name,metadata)
  select 'driver-documents',storage_path,'{"mimetype":"image/jpeg"}'::jsonb from public.driver_documents
  union all select 'driver-documents',storage_path,'{"mimetype":"image/jpeg"}'::jsonb from public.vehicle_documents on conflict do nothing;
  insert into public.driver_agreement_acceptances select '${D}',k,'preview-30-draft-1'
   from unnest(array['terms_of_service','driver_service','privacy','safety','document_declaration']) k;`);
 as(A,open());as(A,execute(action('documents',DOC,'approve',0,{documentKind:'driver'})));
 as(A,execute(action('vehicles',V,'activate')));
 as(A,execute(action('drivers',D,'approve')));
 assert.equal(sql(`select approval_status||':'||status||':'||is_online from public.drivers where id='${D}'`),'approved:aprobado:false');
 assert.equal(sql(`select role from public.profiles where id='${D}'`),'conductor');
 assert.equal(sql('select count(*) from public.driver_documents'),'6');
});
function parallel(q){
 return new Promise(resolve=>{
  const p=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});let out='',err='';
  p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',e=>resolve({code:-1,out,err:String(e)}));
  p.on('close',code=>resolve({code,out:out.trim(),err}));p.stdin.end(q);
 });
}
const actorSql=(id,q)=>`set request.jwt.claims='{"sub":"${id}","session_id":"fixture"}';set role authenticated;${q}`;
test('dos decisiones concurrentes no pisan estado ni duplican auditoría',async()=>{
 const p=action('incidents',I,'triage'),q=action('incidents',I,'review');
 const r=await Promise.all([parallel(actorSql(A,execute(p))),parallel(actorSql(A,execute(q)))]);
 assert.equal(r.filter(x=>x.code===0).length,1);
 assert.match(r.find(x=>x.code!==0).err,/revision_conflict/);
 assert.equal(sql('select count(*) from public.admin_console_audit'),'1');
});
test('aceptación concurrente y suspensión nunca dejan un viaje aceptado por conductor suspendido',async()=>{
 const trip='00000000-0000-0000-0000-000000000031';
 sql(`update public.drivers set approval_status='approved',status='aprobado',is_online=true,status_kind='online' where id='${D}';
  insert into public.trips(id,passenger_id,status) values('${trip}','${P}','requested')`);
 const rev=Number(sql(`select admin_revision from public.drivers where id='${D}'`));
 const suspension=parallel(`begin;select id from public.drivers where id='${D}' for update;select pg_sleep(0.3);
  ${actorSql(A,execute(action('drivers',D,'suspend',rev)))};commit;`);
 const accepting=parallel(actorSql(D,`select id from public.accept_trip('${trip}')`));
 const results=await Promise.all([suspension,accepting]);
 assert.ok(results.some(r=>r.code===0));
 assert.equal(sql(`select count(*) from public.trips t join public.drivers d on d.id=t.driver_id
  where t.status::text in ('accepted','arrived','in_progress') and d.approval_status::text<>'approved'`),'0');
 assert.ok(results.some(r=>/approved_online_driver_required|driver_has_active_trip|revision_conflict/.test(r.err)));
});
