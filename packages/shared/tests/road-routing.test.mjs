import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as road from '../src/lib/roadRouting.ts';

const A={latitude:18.45,longitude:-66.1}, B={latitude:18.44,longitude:-66.09};
const fixture=()=>({code:'Ok',routes:[{distance:2380,duration:420,geometry:{type:'LineString',
  coordinates:[[-66.1,18.45],[-66.095,18.45],[-66.09,18.44]]},legs:[{steps:[{mode:'driving'}]}]}],
  waypoints:[{distance:0},{distance:0}]});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {resolve,promise};};
const failed=(code)=>error=>error instanceof road.RouteError && error.code===code;
const addressModule=()=>{
  const exports={};
  const compiled=ts.transpileModule(readFileSync(new URL('../src/lib/addressSearch.ts',import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  vm.runInNewContext(compiled.outputText,{exports,Date,Map,fetch,AbortController,setTimeout,clearTimeout,
    require:name=>{assert.equal(name,'./roadRouting');return road;}});
  return exports;
};

test('rutas PR: rangos/números válidos y puntos faltantes o extranjeros rechazados',async()=>{
  let calls=0;
  const route=road.createRoadRouter(async()=>{calls++;return fixture();});
  for(const origin of [null,{latitude:NaN,longitude:-66},{latitude:19,longitude:-66},{latitude:18,longitude:0}]) {
    await assert.rejects(route(origin,B),failed('invalid_origin'));
  }
  await assert.rejects(route(A,{latitude:18,longitude:-64}),failed('invalid_destination'));
  await assert.rejects(route(A,A),failed('same_point'));
  assert.equal(calls,0);
  assert.ok(road.isPuertoRicoPoint({latitude:18.1,longitude:-65.4}));
});
test('distancia/ETA vienen del proveedor, geometría se conserva y no hay métricas de línea recta',()=>{
  const result=road.parseRoadRoute(fixture(),A,B,100);
  assert.equal(result.distanceMeters,2380);
  assert.equal(result.durationSeconds,420);
  assert.equal(result.coordinates.length,3);
  assert.equal(road.formatRoadRoute(result),'2.4 km · 7 min estimados');
  assert.equal(road.routeMatches(result,A,B),true);
  assert.equal(road.routeMatches(result,B,A),false);
});
test('sin carretera no produce una ruta ni tiempo inventados',()=>{
  for(const code of ['NoRoute','NoSegment']) assert.throws(()=>road.parseRoadRoute({code},A,B,0),failed('no_route'));
});
test('rechaza métricas inválidas y geometría ausente, malformada, extranjera o de otro viaje',()=>{
  for(const patch of [{distance:0},{duration:-1},{distance:Infinity},{geometry:null},
    {geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},
    {geometry:{type:'LineString',coordinates:[[-67,18],[-67.1,18.1]]}}]) {
    const json=fixture();Object.assign(json.routes[0],patch);
    assert.throws(()=>road.parseRoadRoute(json,A,B,0),error=>error instanceof road.RouteError);
  }
});
test('no se ofrece ferry como carretera y no se aceptan modos de transporte desconocidos',()=>{
  for(const [mode,code] of [['ferry','ferry'],['walking','unavailable']]) {
    const json=fixture();json.routes[0].legs[0].steps[0].mode=mode;
    assert.throws(()=>road.parseRoadRoute(json,A,B,0),failed(code));
  }
  const json=fixture();json.waypoints[0].distance=300;
  assert.throws(()=>road.parseRoadRoute(json,A,B,0),failed('no_route'));
});
test('caché temporal con copias, caducidad y máximo 24 rutas',async()=>{
  let now=100,calls=0;
  const route=road.createRoadRouter(async()=>{calls++;return fixture();},()=>now,0);
  const first=await route(A,B);
  first.coordinates[0][0]=0;first.origin.latitude=0;
  assert.equal((await route(A,B)).coordinates[0][0],-66.1);
  assert.equal(calls,1);
  now+=300_000;await route(A,B);assert.equal(calls,2);
  for(let i=1;i<=24;i++) await route({...A,latitude:A.latitude+i*.00001},B);
  await route(A,B);assert.equal(calls,27);
});
test('URL solo incluye extremos seleccionados y opciones OSRM, no identidades ni secretos',async()=>{
  let url;
  const route=road.createRoadRouter(async(value)=>{url=value;return fixture();});
  const result=await route({...A,address:'privada',driver_id:'private-id'},B);
  assert.match(url,/\/-66\.1,18\.45;-66\.09,18\.44\?/);
  assert.match(url,/geometries=geojson/);
  assert.match(url,/steps=true/);
  assert.doesNotMatch(url,/private-id|privada|apikey|token|Authorization/);
  assert.deepEqual(Object.keys(result.origin).sort(),['latitude','longitude']);
});
test('abortada ni siquiera devuelve caché ni realiza otra petición',async()=>{
  let calls=0;
  const route=road.createRoadRouter(async()=>{calls++;return fixture();});
  await route(A,B);
  const controller=new AbortController();controller.abort();
  await assert.rejects(route(A,B,controller.signal),failed('cancelled'));
  assert.equal(calls,1);
});
test('un reintento como máximo para desconexión transitoria; NoRoute no reintenta',async()=>{
  let calls=0;
  const route=road.createRoadRouter(async()=>{calls++;if(calls===1) throw new road.RouteError('offline',true);return fixture();},Date.now,0);
  await route(A,B);assert.equal(calls,2);
  let attempts=0;
  const unavailable=road.createRoadRouter(async()=>{attempts++;throw new road.RouteError('unavailable',true);},Date.now,0);
  await assert.rejects(unavailable(A,B),failed('unavailable'));assert.equal(attempts,2);
  let noRouteCalls=0;
  const noRoute=road.createRoadRouter(async()=>{noRouteCalls++;return {code:'NoRoute'};},Date.now,0);
  await assert.rejects(noRoute(A,B),failed('no_route'));assert.equal(noRouteCalls,1);
});
test('deadline funciona aunque fetch ignore AbortSignal; respuesta lenta termina con estado slow',async()=>{
  const transport=road.createMapTransport(async()=>new Promise(()=>{}),15);
  await assert.rejects(transport('https://fixture.invalid'),failed('slow'));
});
test('cancelar fetch no cooperativo termina inmediatamente sin actualizar después',async()=>{
  const started=defer();
  const transport=road.createMapTransport(async()=>{started.resolve();return new Promise(()=>{});},1000);
  const controller=new AbortController();
  const pending=transport('https://fixture.invalid',controller.signal);
  await started.promise;controller.abort();
  await assert.rejects(pending,failed('cancelled'));
});
test('HTTP 400 NoSegment distingue sin ruta; HTTP 429 no se reintenta automáticamente',async()=>{
  const transport=road.createMapTransport(async()=>new Response('{"code":"NoSegment"}',{status:400}));
  assert.equal((await transport('https://fixture.invalid')).code,'NoSegment');
  let calls=0;
  const throttled=road.createMapTransport(async()=>{calls++;return new Response('{"code":"TooManyRequests"}',{status:429});});
  const route=road.createRoadRouter(throttled,Date.now,0);
  await assert.rejects(route(A,B),failed('unavailable'));assert.equal(calls,1);
});
test('HTTP malformado/proveedor caído y fallo de red se clasifican sin métricas falsas',async()=>{
  const bad=road.createMapTransport(async()=>new Response('not JSON'));
  await assert.rejects(bad('https://fixture.invalid'),failed('unavailable'));
  const off=road.createMapTransport(async()=>{throw new TypeError('network failure');});
  await assert.rejects(off('https://fixture.invalid'),failed('offline'));
});
test('respuestas atrasadas y tras desmontar no reemplazan el origen/destino actuales',async()=>{
  const a=defer(),b=defer(),states=[];
  let calls=0;
  const controller=road.createRouteController(()=>++calls===1?a.promise:b.promise,state=>states.push(state));
  const p=controller.select('old',A,B),q=controller.select('new',B,A);
  b.resolve({...road.parseRoadRoute(fixture(),A,B,0),origin:B,destination:A});
  await q;
  a.resolve(road.parseRoadRoute(fixture(),A,B,0));await p;
  assert.equal(states.at(-1).key,'new');
  assert.equal(states.filter(s=>s.status==='ready').length,1);
  controller.cancel();
});
test('cancelar o editar un punto invalida la ruta previa y distingue origen inválido',async()=>{
  const states=[];
  const controller=road.createRouteController(road.createRoadRouter(async()=>fixture()),state=>states.push(state));
  await controller.select('first',A,B);
  await controller.select('edit',null,B);
  assert.equal(states.at(-1).status,'idle');assert.equal(states.at(-1).route,null);
  await controller.select('bad',{latitude:0,longitude:0},B);
  assert.equal(states.at(-1).status,'invalid_origin');
});
test('Photon descarta municipio genérico y puntos fuera de PR; conserva dirección explícita',()=>{
  const {photonAddresses}=addressModule();
  const feature=(props,xy=[-66.1,18.45])=>({properties:props,geometry:{type:'Point',coordinates:xy}});
  const results=photonAddresses({features:[
    feature({name:'San Juan',osm_value:'city'}),
    feature({name:'Distrito',osm_key:'boundary',osm_value:'administrative'}),
    feature({name:'Localidad',osm_key:'place',osm_value:'locality'}),
    feature({name:'00901',osm_value:'postcode'}),
    feature({name:'Outside',osm_value:'cafe'},[-80,25]),
    feature({name:'Café',street:'Calle Luna',housenumber:'12',city:'San Juan',postcode:'00901',osm_value:'cafe'}),
  ]});
  assert.equal(results.length,1);
  assert.match(results[0].address,/12 Calle Luna/);
  assert.match(results[0].address,/00901, Puerto Rico/);
});
test('Photon cachea consultas normalizadas y cancela resultados tardíos sin guardarlos',async()=>{
  const {createAddressSearch}=addressModule();
  let calls=0;
  const data={features:[{properties:{name:'Café',osm_value:'cafe'},geometry:{type:'Point',coordinates:[-66.1,18.45]}}]};
  const search=createAddressSearch(async()=>{calls++;return data;});
  await search('  Café ');await search('CAFÉ');assert.equal(calls,1);
  const delayed=defer();let delayedCalls=0;
  const pendingSearch=createAddressSearch(async()=>{delayedCalls++;return delayedCalls===1?delayed.promise:data;});
  const controller=new AbortController();
  const pending=pendingSearch('Plaza',controller.signal);
  controller.abort();delayed.resolve(data);
  await assert.rejects(pending,error=>error.code==='cancelled');
  await pendingSearch('Plaza');assert.equal(delayedCalls,2);
});
test('conductor usa extremos del viaje, no ubicación privada/GPS como origen implícito',()=>{
  assert.deepEqual(road.tripRoutePoints({pickup_lat:18.45,pickup_lng:-66.1,dropoff_lat:18.44,dropoff_lng:-66.09}),
    {origin:A,destination:B});
  assert.equal(road.tripRoutePoints(null),null);
  assert.equal(road.isPuertoRicoPoint(road.tripRoutePoints({pickup_lat:null,pickup_lng:null,dropoff_lat:18,dropoff_lng:-66}).origin),false);
  const api=readFileSync(new URL('../src/lib/rideService.ts',import.meta.url),'utf8');
  const insert=api.slice(api.indexOf('export async function requestTrip('),api.indexOf('export async function getPassengerActiveTrip('));
  assert.doesNotMatch(insert,/durationSeconds|distanceMeters|route_geometry|fare_estimate\s*:/);
  const passenger=readFileSync(new URL('../../../artifacts/dame-pon-pasajero/components/PassengerHome.tsx',import.meta.url),'utf8');
  assert.match(passenger,/handlePress=\{setDestination\}/);
  assert.match(passenger,/Confirmar y solicitar Pon/);
  const native=readFileSync(new URL('../src/components/LiveRideMap.native.tsx',import.meta.url),'utf8');
  assert.match(native,/GeoJSONSource[\s\S]*LineString[\s\S]*route\.coordinates/);
  assert.match(native,/fitBounds\(getBounds\(locations\)/);
  assert.doesNotMatch(native,/getDriverLocation|from\('drivers'\)/);
});
