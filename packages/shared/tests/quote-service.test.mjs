import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../src/lib/quotePolicy.ts';
import * as roads from '../src/lib/roadRouting.ts';
const root=new URL('../../../',import.meta.url);
const requireApi=createRequire(new URL('artifacts/api-server/package.json',root));
const requireZod=createRequire(new URL('lib/api-zod/package.json',root));
function load(path,mocks) {
  const exports={};
  const js=ts.transpileModule(readFileSync(new URL(path,root),'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,process:{env:{}},fetch,AbortSignal,AbortController,setTimeout,clearTimeout,
    require:name=>name in mocks?mocks[name]:requireApi(name)});
  return exports;
}
const service=load('artifacts/api-server/src/quotes/service.ts',{
  '@workspace/dame-pon-shared/lib/quotePolicy':policy,'@workspace/dame-pon-shared/lib/roadRouting':roads});
const schemas=load('lib/api-zod/src/generated/api.ts',{zod:requireZod('zod')});
const {quoteRouter}=load('artifacts/api-server/src/routes/quotes.ts',{
  '@workspace/api-zod':schemas,'../quotes/service':service,'@workspace/dame-pon-shared/lib/quotePolicy':policy});
const P='00000000-0000-0000-0000-000000000003',Q='00000000-0000-0000-0000-000000000011';
const input={origin:{latitude:18.45,longitude:-66.1,address:'Origen sintético'},
  destination:{latitude:18.44,longitude:-66.09,address:'Destino sintético'},vehicleType:'sedan'};
const rule={id:Q,municipio_id:null,vehicle_type:'sedan',commercial_approved:true,currency:'USD',algorithm:'fixed-route-v1',
  minimum_policy:'floor_total',night_policy:'explicitly_not_applicable',base_cents:10,per_km_cents:7,per_min_cents:3,minimum_cents:11};
const geometry={type:'Polygon',coordinates:[[[-67,18],[-65.5,18],[-65.5,18.6],[-67,18.6],[-67,18]]]};
function deps(options={}) {
  const calls=[];
  return {calls,authenticate:async token=>{calls.push(['auth',token]);if(token!=='synthetic-token')throw new policy.QuoteFailure('unauthenticated',401);return P;},
    route:async(a,b)=>{calls.push(['route',a,b]);if(options.routeError)throw Error('provider unavailable');
      return {origin:a,destination:b,coordinates:[[-66.1,18.45],[-66.09,18.44]],distanceMeters:1000,durationSeconds:60,calculatedAt:Date.now()};},
    rpc:async(name,args)=>{calls.push([name,args]);
      if(name==='quote_server_context')return {enabled:true,areas:[{id:Q,municipio_id:'Ponce',nombre:'Ponce',geometry}],
        rules:options.noRules?[]:[rule]};
      if(name==='quote_server_confirm'){if(options.expired)throw new policy.QuoteFailure('quote_expired',409);return Q;}
      return {id:Q,currency:'USD',totalCents:20,...input,distanceMm:1000000,durationMs:60000,ruleVersionId:Q,
        policyVersion:'fixed-route-v1',serverTime:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),
        breakdown:policy.calculateQuote(rule,1000000,60000).breakdown};
    }};
}
async function httpCase(d,enabled,callback) {
  const app=requireApi('express')();app.use(requireApi('express').json());app.use('/api',quoteRouter(()=>enabled,d));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
  const post=async(path,body,token='synthetic-token')=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:'POST',
      headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  try{await callback(post);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('dinero racional: redondeo HALF_UP una sola vez, mínimo explícito y límite de centavos',()=>{
  assert.equal(policy.calculateQuote(rule,1000000,60000).totalCents,20);
  const tiny={...rule,base_cents:0,per_km_cents:1,per_min_cents:0,minimum_cents:0};
  assert.equal(policy.calculateQuote(tiny,499999,1).totalCents,0);
  assert.equal(policy.calculateQuote(tiny,500000,1).totalCents,1);
  assert.equal(policy.calculateQuote({...tiny,minimum_cents:9},1,1).totalCents,9);
  assert.throws(()=>policy.calculateQuote({...rule,commercial_approved:false},1,1));
  assert.throws(()=>policy.calculateQuote({...rule,night_policy:'unknown'},1,1));
  assert.throws(()=>policy.calculateQuote({...rule,currency:'EUR'},1,1));
  assert.throws(()=>policy.calculateQuote({...rule,base_cents:2_147_483_647},1,1));
});
test('municipios: límites reales aprobados, huecos y fronteras ambiguas; no centroide',()=>{
  assert.equal(policy.polygonContains(geometry,input.origin),true);
  assert.equal(policy.polygonContains(geometry,{latitude:17,longitude:-66}),false);
  assert.throws(()=>policy.polygonContains(geometry,{latitude:18,longitude:-66}),/municipality_ambiguous/);
  assert.throws(()=>policy.polygonContains({type:'Point',coordinates:[-66,18]},input.origin));
  const hole={...geometry,coordinates:[...geometry.coordinates,[[-66.2,18.3],[-66,18.3],[-66,18.5],[-66.2,18.5],[-66.2,18.3]]]};
  assert.equal(policy.polygonContains(hole,input.origin),false);
});
test('compuerta apagada no autentica ni llama BD/ruta; no activa precios por accidente',async()=>{
  const d=deps();
  await httpCase(d,false,async post=>{assert.equal((await post('/quotes',input)).status,503);});
  assert.equal(d.calls.length,0);
});
test('API autenticada, estricta contra precio, actor o métricas inyectadas, incluso REST anidado',async()=>{
  const d=deps();
  await httpCase(d,true,async post=>{
    assert.equal((await post('/quotes',input,null)).status,401);
    assert.equal((await post('/quotes',input,'forged')).status,401);
    for(const extra of [{totalCents:1},{passenger_id:Q},{distanceMeters:1},{durationSeconds:1},{municipio:'inventado'}])
      assert.equal((await post('/quotes',{...input,...extra})).status,400);
    assert.equal((await post('/quotes',{...input,origin:{...input.origin,price:1}})).status,400);
    assert.equal(d.calls.filter(c=>c[0]==='route').length,0);
    const response=await post('/quotes',input);
    assert.equal(response.status,200);assert.equal(response.body.totalCents,20);
    const saved=d.calls.find(c=>c[0]==='quote_server_store')[1];
    assert.equal(saved.p_actor,P);assert.equal(saved.p_distance_mm,1000000);assert.equal(saved.p_expected_cents,20);
    assert.equal((await post('/quotes',input)).status,429);
  });
});
test('sin regla comercial: ni consulta OSRM ni crea importe con fare_rules de ejemplo',async()=>{
  const d=deps({noRules:true});
  await httpCase(d,true,async post=>{assert.equal((await post('/quotes',input)).status,503);});
  assert.equal(d.calls.some(c=>c[0]==='route'||c[0]==='quote_server_store'),false);
});
test('fallo de proveedor no guarda cotización ni inventa métricas',async()=>{
  const d=deps({routeError:true});
  await httpCase(d,true,async post=>{assert.equal((await post('/quotes',input)).status,503);});
  assert.equal(d.calls.some(c=>c[0]==='quote_server_store'),false);
});
test('confirmar solo ID y clave: propietario viene del token y expiración no crea viaje',async()=>{
  const d=deps({expired:true});
  await httpCase(d,true,async post=>{
    assert.equal((await post('/quotes/confirm',{quoteId:Q,idempotencyKey:Q,totalCents:1})).status,400);
    assert.equal((await post('/quotes/confirm',{quoteId:Q,idempotencyKey:Q})).status,409);
    assert.equal(d.calls.find(c=>c[0]==='quote_server_confirm')[1].p_actor,P);
  });
});
test('las dos entradas usan cotización y el camino central no omite el control al confirmar',()=>{
  const read=p=>readFileSync(new URL(p,root),'utf8');
  for(const path of ['artifacts/dame-pon-pasajero/components/PassengerHome.tsx','artifacts/dame-pon-pasajero/components/Payment.tsx']) {
    assert.match(read(path),/useFareQuote/);assert.match(read(path),/fare\.required.*!fare\.quote/);
  }
  assert.match(read('packages/shared/src/lib/rideService.ts'),/if\(quotesRequired\(\)\)/);
  assert.doesNotMatch(read('artifacts/dame-pon-pasajero/components/Payment.tsx'),/\$\{amount\}/);
  const sql=read('docs/phase4-drafts/001_quote_schema_and_rpc.sql');
  assert.doesNotMatch(sql,/insert into public\.fare_rules|insert into public\.payments|update public\.payments/i);
  assert.match(sql,/default false/);assert.match(sql,/grant execute[\s\S]*to service_role/);
});
