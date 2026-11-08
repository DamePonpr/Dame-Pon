import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const requireApi=createRequire(new URL('../../../artifacts/api-server/package.json',import.meta.url));
const requireZod=createRequire(new URL('../../../lib/api-zod/package.json',import.meta.url));
function load(file,mocks={},extra={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,process:{env:{}},URL,Date,Uint8Array,AbortSignal,fetch,require:n=>n in mocks?mocks[n]:requireApi(n),...extra});
 return exports;
}
const gateway=load('artifacts/api-server/src/admin/gateway.ts');
const schemas=load('lib/api-zod/src/generated/api.ts',{zod:requireZod('zod')});
const {adminRouter}=load('artifacts/api-server/src/routes/admin.ts',{'@workspace/api-zod':schemas,'../admin/gateway':gateway});
const A='00000000-0000-0000-0000-000000000009',ID='00000000-0000-0000-0000-000000000022';
const body={section:'drivers',recordId:ID,action:'approve',reason:'SINTÉTICO SOLO LOCAL',expectedRevision:0,idempotencyKey:ID};
function fake(){
 const calls=[];return {calls,
 async authenticate(token){calls.push(['auth',token]);if(token!=='fixture-admin')throw new gateway.AdminFault(403,'forbidden','No administrador');return A;},
 async rpc(token,name,args){
  calls.push([name,args,token]);
  if(name==='admin_console_session')return {actorId:A,role:'admin',schemaVersion:'phase5-v1'};
  if(name==='admin_console_overview')return {driversPending:2,incidentsOpen:1,supportOpen:0,tripsActive:0,asOf:new Date().toISOString()};
  if(name==='admin_console_list')return {items:[{id:ID,title:'Sintético',status:'pending_review',revision:0,license_number:'NO-EXPOSICIÓN'}],total:1,offset:0,limit:25};
  if(name==='admin_console_action')return {recordId:ID,auditId:ID};
  if(name==='admin_console_document')return {path:`${ID}/license.jpg`};
  throw Error('unexpected rpc');
 },
 async sign(token,path){calls.push(['sign',path,token]);return 'https://fixture.invalid/storage/v1/object/sign/driver-documents/doc?token=SYNTHETIC';}};
}
async function http(g,enabled,run){
 const express=requireApi('express'),app=express();app.use(express.json());app.use('/api',adminRouter({gateway:g,enabled:()=>enabled}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=async(path,method='GET',data,token='fixture-admin')=>{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`,{method,headers:{
   'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
 };
 try{await run(call);}finally{await new Promise(r=>server.close(r));}
}
test('panel apagado: configuración honesta, sin Auth/RPC ni cambios de flags',async()=>{
 const g=fake();
 await http(g,false,async call=>{
  assert.equal((await call('/config')).body.enabled,false);
  assert.equal((await call('/overview')).status,503);
  assert.equal((await call('/actions','POST',body)).status,503);
 });
 assert.equal(g.calls.length,0);
});
test('cada operación exige token y autorización independiente de base, no rol enviado por cliente',async()=>{
 const g=fake();
 await http(g,true,async call=>{
  assert.equal((await call('/overview','GET',null,null)).status,401);
  assert.equal((await call('/overview','GET',null,'fixture-passenger')).status,403);
  const r=await call('/overview');assert.equal(r.status,200);assert.equal(r.cache,'no-store');
  assert.equal(g.calls.filter(c=>c[0]==='admin_console_session').length,1);
  assert.equal((await call('/actions','POST',{...body,actorId:A})).status,400);
  assert.equal((await call('/actions','POST',{...body,reason:'           '})).status,400);
  assert.equal((await call('/actions','POST',{...body,section:'pricing'})).status,400);
  assert.equal((await call('/records?section=drivers&limit=101')).status,400);
 });
});
test('contratos: paginación acotada, DTO sin campos privados y transición solo confirmada por RPC',async()=>{
 const g=fake();
 await http(g,true,async call=>{
  const page=await call('/records?section=drivers&limit=25&offset=0');
  assert.equal(page.status,200);assert.equal(JSON.stringify(page.body).includes('license_number'),false);
  const r=await call('/actions','POST',body);assert.equal(r.status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(g.calls.find(c=>c[0]==='admin_console_action')[1])),{p_input:body});
 });
});
test('revocación en RPC y conflicto no se presentan como aprobación ni ejecutan cambios',async()=>{
 const g=fake(),original=g.rpc;
 g.rpc=async(t,n,a)=>{if(n==='admin_console_session')throw new gateway.AdminFault(403,'forbidden','Revocado');return original(t,n,a);};
 await http(g,true,async call=>{assert.equal((await call('/actions','POST',body)).status,403);});
 assert.equal(g.calls.some(c=>c[0]==='admin_console_action'),false);
});
test('documento solo ID/kind/revisión/motivo; URL efímera, no ruta libre ni fallback público',async()=>{
 const g=fake(),input={id:ID,kind:'driver',reason:body.reason,expectedRevision:0,idempotencyKey:ID};
 await http(g,true,async call=>{
  assert.equal((await call('/documents/open','POST',{...input,path:'otro/privado.jpg'})).status,400);
  const start=Date.now(),r=await call('/documents/open','POST',input);
  assert.equal(r.status,200);assert.ok(Date.parse(r.body.expiresAt)<=start+61000);assert.equal(r.cache,'no-store');
  assert.equal('path' in r.body,false);
  g.rpc=async(t,n)=>n==='admin_console_session'?{actorId:A,role:'admin',schemaVersion:'phase5-v1'}:{path:'https://otro.example/archivo'};
  assert.equal((await call('/documents/open','POST',input)).status,409);
 });
 assert.equal(g.calls.filter(c=>c[0]==='sign').length,1);
});
test('firma de archivos: formatos por magic bytes, no HTML ni recorrido o URL de otro origen',async()=>{
 assert.equal(gateway.documentMime(new Uint8Array([255,216,255,0])),'image/jpeg');
 assert.equal(gateway.documentMime(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(gateway.documentMime(new Uint8Array([37,80,68,70,45])),'application/pdf');
 assert.equal(gateway.documentMime(new TextEncoder().encode('<html>')) ,null);
 for(const p of ['otro/file.jpg',`${A}/../x`,`${A}/%2e/x`,`${A}/x?secret`,`${A}/x\\y`])assert.equal(gateway.safeDocumentPath(p),false);
 const calls=[],env={DAME_PON_ADMIN_ENABLED:'true',SUPABASE_URL:'https://fixture.invalid',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'PUBLIC_FIXTURE_ONLY'};
 let evil=false,html=false;
 const remote=load('artifacts/api-server/src/admin/gateway.ts',{},{
  process:{env},
  fetch:async(url,init)=>{
   calls.push([url,init]);
   if(url.includes('/object/authenticated/'))return new Response(html?'<html>':new Uint8Array([255,216,255,0,0,0,0,0]),{headers:{'Content-Type':'image/jpeg'}});
   return Response.json({signedURL:evil?'https://evil.invalid/private':'/object/sign/driver-documents/'+A+'/x.jpg?token=FIXTURE'});
  },
 }).remoteAdminGateway();
 const url=await remote.sign('USER_JWT_FIXTURE',`${A}/x.jpg`);assert.ok(url.startsWith('https://fixture.invalid/storage/v1/object/sign/'));
 assert.equal(calls[0][1].headers.Authorization,'Bearer USER_JWT_FIXTURE');
 assert.equal(calls[0][1].headers.apikey,'PUBLIC_FIXTURE_ONLY');
 evil=true;await assert.rejects(()=>remote.sign('USER_JWT_FIXTURE',`${A}/x.jpg`),/Referencia privada inválida/);
 html=true;const before=calls.length;await assert.rejects(()=>remote.sign('USER_JWT_FIXTURE',`${A}/x.jpg`),/contenido no coincide/);
 assert.equal(calls.length-before,1); // No signed link minted for forged MIME content.
});
test('barrera de interfaz vincula sesión verificada a identidad actual; tarifas/viajes siempre lectura',()=>{
 const ui=load('artifacts/dame-pon-admin/src/lib/admin.ts');
 const verified={actorId:A,role:'admin',schemaVersion:'phase5-v1'};
 assert.equal(ui.adminSessionMatches(verified,A),true);
 for(const [s,id] of [[verified,null],[verified,ID],[{...verified,role:'pasajero'},A],[{...verified,schemaVersion:'otro'},A],[undefined,A]])
  assert.equal(ui.adminSessionMatches(s,id),false);
 for(const section of ['pricing','trips']){
  const meta=ui.SECTIONS.find(s=>s.key===section);assert.equal(meta.readOnly,true);assert.equal(meta.actions.length,0);
 }
});
