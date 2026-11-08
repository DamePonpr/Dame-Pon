import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,respond,session} from './fixtures.mjs';
import {parseRoadRoute} from '../../packages/shared/src/lib/roadRouting.ts';
test('fixture OSRM respeta validación real de geometría y snapping, sin debilitarla',async()=>{
 const r=await respond(initial(),'https://fixture.invalid/route/v1/driving/x','GET',null);
 const parsed=parseRoadRoute(r.data,{latitude:18.4655,longitude:-66.1057},{latitude:18.4621,longitude:-66.1001},Date.now());
 assert.equal(parsed.distanceMeters,2400);assert.equal(parsed.durationSeconds,300);
 assert.throws(()=>parseRoadRoute({...r.data,waypoints:[]},{latitude:18.4655,longitude:-66.1057},{latitude:18.4621,longitude:-66.1001},Date.now()));
});
test('fixture cotización: reintentos y confirmación concurrente crean un único registro ficticio',async()=>{
 const s=initial(),q=await respond(s,'/api/quotes','POST',{origin:{address:'Origen ficticio'},destination:{address:'Destino ficticio'}});
 const body={quoteId:q.data.id,idempotencyKey:q.data.id};
 const replies=await Promise.all(Array.from({length:4},()=>respond(s,'/api/quotes/confirm','POST',body)));
 assert.equal(new Set(replies.map(r=>r.data.tripId)).size,1);assert.equal(s.trips.length,1);
 assert.equal(s.trips[0].payment_status,'pending');
 assert.match(session().access_token,/FIXTURE_NOT_A_VALID_SIGNATURE$/);
});
test('fixture PostgREST distingue historial completado de viajes activos',async()=>{
 const s=initial();s.trips.push({id:'fixture-completed',status:'completed'},{id:'fixture-active',status:'requested'});
 const history=await respond(s,'/rest/v1/passenger_trips?status=eq.completed','GET',null);
 const active=await respond(s,'/rest/v1/passenger_trips?status=in.(requested,accepted)','GET',null);
 assert.equal(history.data[0].id,'fixture-completed');assert.equal(history.data.length,1);
 assert.equal(active.data[0].id,'fixture-active');assert.equal(active.data.length,1);
});
