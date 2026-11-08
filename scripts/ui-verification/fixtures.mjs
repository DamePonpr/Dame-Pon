// TEST ONLY. All records, identities, rules and amounts below are synthetic.
export const ids={passenger:'10000000-0000-4000-8000-000000000001',admin:'10000000-0000-4000-8000-000000000009',
 driver:'10000000-0000-4000-8000-000000000002',vehicle:'10000000-0000-4000-8000-000000000003',doc:'10000000-0000-4000-8000-000000000004'};
const uuid=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function session(admin=false){
 const id=admin?ids.admin:ids.passenger;
 const user={id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'Persona Ficticia'},created_at:new Date().toISOString()};
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const access_token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+7200,session_id:uuid(99)})+'.FIXTURE_NOT_A_VALID_SIGNATURE';
 return {access_token,token_type:'bearer',refresh_token:'FIXTURE_NOT_A_CREDENTIAL',expires_in:7200,expires_at:Math.floor(Date.now()/1000)+7200,user};
}
export function initial(){
 return {quoteError:false,quoteTtl:120000,docTtl:2000,docError:false,denied:false,authRole:'admin',confirmError:false,confirmLoseResponse:false,
  quotes:[],trips:[],requests:[],events:[],actions:{},next:100,
  records:{drivers:{id:ids.driver,title:'Conductor Ficticio',status:'pending_review',revision:0,secondary:'San Juan'},
   vehicles:{id:ids.vehicle,title:'Vehículo Ficticio',status:'pending',revision:0,secondary:'TEST-000'},
   incidents:{id:uuid(10),title:'Incidente de prueba',status:'open',revision:0,secondary:'low',assigneeId:null},
   support:{id:uuid(11),title:'Soporte de prueba',status:'open',revision:0,secondary:'normal',assigneeId:null},
   trips:{id:uuid(12),title:'Viaje de prueba',status:'completed',revision:0},
   pricing:{id:uuid(13),title:'REGLA SINTÉTICA — NO COMERCIAL',status:'sin_aprobación',revision:0}}};
}
export async function respond(state,target,method,body,headers={}){
 const u=new URL(target,'http://fixture.local'),p=u.pathname;
 state.requests.push({path:p,method,body});
 const ok=(data,status=200)=>({status,data});
 const error=(code,status=409)=>ok({code,error:code==='revision_conflict'?'Otro cambio modificó el registro. Actualiza antes de decidir.':'Fallo simulado: '+code},status);
 if(p==='/auth/v1/token')state.authRole=(body?.email??'').includes('nonadmin')?'pasajero':'admin';
 if(p.includes('/auth/v1/'))return ok(p.endsWith('/user')?session(state.authRole==='admin').user:session(state.authRole==='admin'));
 if(p==='/api/admin/config')return ok({enabled:true,supabaseUrl:'https://fixture.invalid',publishableKey:'sb_publishable_fixture_only'});
 if(p==='/api/admin/session')return state.denied||state.authRole!=='admin'?error('forbidden',403):ok({actorId:ids.admin,role:'admin',schemaVersion:'phase5-v1'});
 if(p.startsWith('/api/admin/')&&(state.denied||state.authRole!=='admin'))return error('forbidden',403);
 if(p==='/api/admin/overview')return ok({driversPending:1,incidentsOpen:1,supportOpen:1,tripsActive:0,asOf:new Date().toISOString()});
 if(p==='/api/admin/assignees')return ok([{id:ids.admin,name:'Administrador Ficticio'}]);
 if(p==='/api/admin/records'){const r=state.records[u.searchParams.get('section')];return ok({items:r?[r]:[],total:r?1:0,offset:0,limit:25});}
 if(p.startsWith('/api/admin/records/')){
  const section=p.split('/')[4],record=state.records[section];
  return record?ok({record,documents:['drivers','vehicles'].includes(section)?[{id:ids.doc,kind:section==='drivers'?'driver':'vehicle',type:'license_front',status:'submitted',revision:0,expiresOn:null}]:[],
   events:state.events.filter(e=>e.recordId===record.id)}):error('not_found',404);
 }
 if(p==='/api/admin/documents/open'){
  if(state.docError)return error('document_unavailable',503);
  return ok({url:'https://fixture.invalid/private/fixture.png',expiresAt:new Date(Date.now()+state.docTtl).toISOString()});
 }
 if(p==='/api/admin/actions'){
  const old=state.actions[body.idempotencyKey];if(old)return ok(old);
  const record=state.records[body.section];
  if(!record||['trips','pricing'].includes(body.section))return error('read_only',403);
  if(record.revision!==body.expectedRevision)return error('revision_conflict');
  if(!body.reason||body.reason.trim().length<10)return error('reason_required',400);
  const statuses={approve:'approved',reject:'pending_documents',suspend:'suspended',activate:'active',out_of_service:'out_of_service',retire:'retired',triage:'triaged',review:'under_review',resolve:'resolved',close:'closed',reopen:'open'};
  const fromStatus=record.status;if(body.action==='assign')record.assigneeId=body.assigneeId;else record.status=statuses[body.action]??record.status;
  record.revision++;
  const auditId=uuid(state.next++);state.events.unshift({id:auditId,recordId:record.id,actorId:ids.admin,action:body.action,reason:body.reason,fromStatus,toStatus:record.status,createdAt:new Date().toISOString()});
  return ok(state.actions[body.idempotencyKey]={recordId:record.id,auditId});
 }
 if(p==='/api/quotes'){
  if(state.quoteError)return error('quote_unavailable',503);
  const q={id:uuid(state.next++),currency:'USD',vehicleType:'sedan',policyVersion:'fixed-route-v1',ruleVersionId:uuid(90),
   origin:body.origin,destination:body.destination,distanceMm:2400000,durationMs:300000,totalCents:987,
   serverTime:new Date().toISOString(),expiresAt:new Date(Date.now()+state.quoteTtl).toISOString(),
   breakdown:{baseCents:100,distanceCents:{numerator:480,denominator:1},timeCents:{numerator:407,denominator:1},minimumCents:0,minimumApplied:false}};
  state.quotes.push(q);return ok(q);
 }
 if(p==='/api/quotes/confirm'){
  const q=state.quotes.find(q=>q.id===body.quoteId);if(!q)return error('quote_missing');
  const existing=state.trips.find(t=>t.quote_id===q.id);if(existing)return ok({tripId:existing.id});
  if(state.confirmError||Date.parse(q.expiresAt)<=Date.now())return error('quote_expired');
  const t=makeTrip(uuid(state.next++),q);state.trips.push(t);
  if(state.confirmLoseResponse){state.confirmLoseResponse=false;return ok({},599);}
  return ok({tripId:t.id});
 }
 if(p.includes('/rest/v1/profiles'))return ok([{id:ids.passenger,full_name:'Persona Ficticia',role:'pasajero',phone:'7870000000',onboarding_completed:true,municipio:'San Juan'}]);
 if(p.includes('/rest/v1/municipios'))return ok([{id:'san_juan',nombre:'San Juan',centro_lat:18.4655,centro_lng:-66.1057}]);
 if(p.includes('/rest/v1/rpc/'))return ok(null);
 if(p.includes('/rest/v1/trips')&&method==='POST'){
  const t={...makeTrip(uuid(state.next++)),...body};state.trips.push(t);return ok(t,201);
 }
 if(/\/rest\/v1\/(passenger_trips|trips)$/.test(p)){
  const id=u.searchParams.get('id')?.replace('eq.',''),single=(headers.accept??'').includes('object');
  let rows=state.trips.filter(t=>!id||t.id===id);
  const filter=u.searchParams.get('status');
  if(filter&&!id)rows=rows.filter(t=>filter.startsWith('eq.')?t.status===filter.slice(3):
   filter.startsWith('in.(')?filter.slice(4,-1).split(',').includes(t.status):false);
  return ok(single?rows[0]??null:rows);
 }
 if(p.includes('/api/')&&u.hostname.includes('photon')||u.hostname.includes('photon')){
  const destination=/(museo|destino|ponce)/i.test(u.searchParams.get('q')??'');
  return ok({features:[{type:'Feature',geometry:{type:'Point',coordinates:destination?[-66.1001,18.4621]:[-66.1057,18.4655]},
   properties:{name:destination?'Museo Ficticio':'Plaza Ficticia',street:'Calle Prueba',housenumber:'10',city:'San Juan',state:'Puerto Rico',country:'United States',countrycode:'US',osm_key:'amenity',osm_value:'museum'}}]});
 }
 if(p.includes('/route/v1/'))return ok({code:'Ok',waypoints:[{distance:0,location:[-66.1057,18.4655]},{distance:0,location:[-66.1001,18.4621]}],
  routes:[{distance:2400,duration:300,legs:[{steps:[{mode:'driving'}]}],geometry:{type:'LineString',coordinates:[[-66.1057,18.4655],[-66.1001,18.4621]]}}]});
 if(p.includes('style')||p.endsWith('.json'))return ok({version:8,sources:{},layers:[]});
 return ok([]);
}
function makeTrip(id,q){
 return {id,passenger_id:ids.passenger,driver_id:null,status:'requested',pickup_address:q?.origin.address??'Plaza Ficticia',
  dropoff_address:q?.destination.address??'Museo Ficticio',pickup_lat:18.4655,pickup_lng:-66.1057,dropoff_lat:18.4621,dropoff_lng:-66.1001,
  requested_at:new Date().toISOString(),accepted_at:null,started_at:null,completed_at:null,municipio_origen:'San Juan',municipio_destino:'San Juan',
  fare_estimate:q?9.87:null,fare_final:null,quote_id:q?.id??null,payment_status:'pending',passenger_pin:'1234'};
}
