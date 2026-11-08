import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
function load(path,mocks,extra={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(resolve(workspace,path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Error,TypeError,AbortController,setTimeout,clearTimeout,process:{env:{EXPO_PUBLIC_REQUIRE_SERVER_QUOTES:'true'}},
   require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected dependency: '+name);},...extra});
 return exports;
}
function client(fetcher){
 const supabase={auth:{getSession:async()=>({data:{session:{access_token:'SYNTHETIC_ONLY'}}})},from:()=>{throw Error('No database read/write expected');}};
 const quotes=load('packages/shared/src/lib/quoteClient.ts',{
  'react-native':{Platform:{OS:'web'}},'./supabase':{supabase},'./quotePolicy':{quoteMatches:()=>true},
 },{fetch:fetcher});
 const service=load('packages/shared/src/lib/rideService.ts',{
  './quoteClient':quotes,'./quotePolicy':{quoteMatches:()=>true},'../lib/supabase':{supabase},'../lib/ratingLogic':{},
 });
 return {quotes,service};
}
test('confirmación rechazada por vencimiento conserva código para bloquear UI hasta nueva cotización',async()=>{
 const c=client(async()=>Response.json({code:'quote_expired'},{status:409}));
 await assert.rejects(()=>c.quotes.quoteApi('/quotes/confirm',{}),e=>e.code==='quote_expired');
 const r=await c.service.requestTrip('fixture','Destino',{address:'Origen'}, {latitude:18.4,longitude:-66.1},{id:'fixture-quote'});
 assert.equal(r.errorCode,'quote_expired');assert.match(r.error,/venció/);assert.equal(r.data,null);
});
test('pérdida de respuesta NO invalida la cotización: reintento conserva la misma clave idempotente',async()=>{
 const bodies=[];
 const c=client(async(url,request)=>{bodies.push(JSON.parse(request.body));throw new TypeError('SIMULATED response lost');});
 for(let n=0;n<2;n++){
  const r=await c.service.requestTrip('fixture','Destino',{address:'Origen'},{latitude:18.4,longitude:-66.1},{id:'same-quote'});
  assert.equal(r.errorCode,undefined);assert.match(r.error,/conectar/);
 }
 assert.deepEqual(bodies,[{quoteId:'same-quote',idempotencyKey:'same-quote'},{quoteId:'same-quote',idempotencyKey:'same-quote'}]);
});
