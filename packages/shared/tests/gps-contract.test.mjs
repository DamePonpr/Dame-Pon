// Execute the ACTUAL TS service/edge handler in a VM with closed, local-only
// adapters. These are wire-contract tests, not Supabase/PostgREST integration.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals) {
  const source = readFileSync(new URL(path,import.meta.url),'utf8');
  const built = ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }});
  assert.equal(built.diagnostics?.filter(item=>item.category===ts.DiagnosticCategory.Error).length ?? 0,0);
  const exports = {};
  vm.runInNewContext(built.outputText,{exports,AbortController,setTimeout,clearTimeout,...globals});
  return exports;
}
function service(reply) {
  const calls = [];
  const supabase = {rpc:(name,args)=>{
    calls.push({name,args});
    const result = Promise.resolve(reply(name,args));
    const request = {
      abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return request; },
      maybeSingle() { return result; },
      then(resolve,reject) { return result.then(resolve,reject); },
    };
    return request;
  }};
  const api = load('../src/lib/presenceService.ts',{require:(name)=>{
    assert.equal(name,'./supabase'); return {supabase};
  }});
  return {api,calls};
}
test('servicio real envía token y secuencia monotónica; ya no envía p_start/driver_id',async()=>{
  const {api,calls} = service(name=>({data:name==='open_driver_presence_session'?'fixture-token':null,error:null}));
  const session = await api.openDriverPresenceSession();
  const fix = {latitude:18.4,longitude:-66.1,timestamp:1_800_000_000_000,accuracy:10};
  await api.publishDriverPresence(fix,session);
  await api.publishDriverPresence(fix,session);
  await api.publishDriverPresence(null,session);
  assert.deepEqual(calls.slice(1).map(call=>call.args.p_sequence),[1,2,3]);
  for (const {args} of calls.slice(1)) {
    assert.equal(args.p_session_id,'fixture-token');
    assert.equal('p_start' in args,false);
    assert.equal('driver_id' in args,false);
  }
  assert.equal(calls.at(-1).args.p_online,false);
  assert.equal(calls.at(-1).args.p_lat,null);
  assert.equal(calls.at(-1).args.p_observed_at,null);
});
test('lectura real envía únicamente trip_id y maneja error de RPC sin fallback drivers',async()=>{
  const {api,calls} = service(()=>({data:null,error:{code:'PGRST202',message:'missing'}}));
  await assert.rejects(api.loadAssignedDriverPresence('own-trip'),/pendiente de activar/);
  assert.equal(calls[0].name,'get_assigned_driver_location');
  assert.deepEqual(Object.keys(calls[0].args),['p_trip_id']);
});
test('servicio propaga 42501 para que el controlador detenga la sesión revocada',async()=>{
  const {api} = service(()=>({data:null,error:{code:'42501',message:'revocada'}}));
  await assert.rejects(api.publishDriverPresence(null,{id:'token',sequence:0}),error=>error.code==='42501');
});

function edge({targets=[],rpcError=null,caller='passenger',status='requested'}={}) {
  let handler;
  const calls = [], sent = [];
  const client = {
    auth:{getUser:async()=>({data:{user:{id:caller}},error:null})},
    rpc:async(name)=>{calls.push(name);return {data:targets,error:rpcError};},
    from:(table)=>{
      assert.notEqual(table,'drivers','No se permite fallback a filas privadas/legacy');
      if (table==='trips') return {select:()=>({eq:()=>({single:async()=>({
        data:{id:'trip',passenger_id:'passenger',driver_id:null,status,
          pickup_lat:18.4,pickup_lng:-66.1,pickup_address:'A',dropoff_address:'B'},error:null,
      })})})};
      assert.equal(table,'profiles');
      return {select:()=>({in:(_column,ids)=>({not:async()=>({
        data:ids.map(id=>({id,push_token:'ExponentPushToken[fixture]'})),error:null,
      })})})};
    },
  };
  load('../../../supabase/functions/trip-push/index.ts',{
    require:(name)=>{assert.equal(name,'npm:@supabase/supabase-js@2');return {createClient:()=>client};},
    Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://fixture.invalid':'fixture-not-a-real-key'},serve:fn=>{handler=fn;}},
    Response,console:{error:()=>{}},
    fetch:async(url,options)=>{
      assert.equal(url,'https://exp.host/--/api/v2/push/send');
      sent.push(JSON.parse(options.body));
      return new Response('{}',{status:200});
    },
  });
  return {calls,sent,invoke:()=>handler(new Request('https://local.invalid/trip-push',{
    method:'POST',headers:{Authorization:'Bearer fixture-not-a-token','Content-Type':'application/json'},
    body:JSON.stringify({action:'new_trip',tripId:'trip'}),
  }))};
}
test('edge real no avisa a clientes legacy/sin targets frescos, aunque continúen online',async()=>{
  const e = edge();
  const response = await e.invoke();
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{delivered:0});
  assert.deepEqual(e.calls,['get_fresh_driver_push_targets']);
  assert.equal(e.sent.length,0);
});
test('edge real falla cerrado si falta la RPC; nunca notifica usando coordenadas antiguas',async()=>{
  const e = edge({rpcError:{message:'function missing'}});
  assert.equal((await e.invoke()).status,500);
  assert.equal(e.sent.length,0);
});
test('edge conserva autorización del viaje y distancia; solo envía a targets frescos cercanos',async()=>{
  const unauthorized = edge({caller:'other-passenger'});
  assert.equal((await unauthorized.invoke()).status,403);
  assert.equal(unauthorized.calls.length,0);
  const e = edge({targets:[{id:'near',current_lat:18.4,current_lng:-66.1},{id:'far',current_lat:30,current_lng:-66.1}]});
  assert.deepEqual(await (await e.invoke()).json(),{delivered:1});
  assert.equal(e.sent[0].length,1);
});
