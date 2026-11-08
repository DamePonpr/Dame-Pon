// Repeatable REAL browser + SIMULATED services; never evidence of remote RLS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {browser} from './cdp.mjs';
import {ids} from './fixtures.mjs';
const root='generated-artifacts/ui-evidence/admin-local',results=[];
await mkdir(root,{recursive:true});
const b=await browser();
const sel=id=>`[data-testid="${id}"]`;
const control=data=>b.evaluate(`window.__fixture.control(${JSON.stringify(data)})`);
const state=()=>b.evaluate('window.__fixture.state()');
const text=t=>b.wait(`document.body.innerText.includes(${JSON.stringify(t)})`);
async function scenario(name,run){
 try{await run();await b.screenshot(`${root}/${name}.png`);results.push({name,status:'passed',evidence:`${name}.png`});}
 catch(error){results.push({name,status:'failed',error:String(error)});await b.screenshot(`${root}/${name}-failed.png`).catch(()=>{});throw error;}
}
async function login(){
 await b.wait(`!!document.querySelector('${sel('input-email')}')`);
 await b.fill(sel('input-email'),'fixture@example.invalid');await b.fill(sel('input-password'),'FICTIONAL-ONLY-NOT-A-REAL-PASSWORD');
 await b.click(sel('button-login'));await b.wait(`!!document.querySelector('${sel('text-actor')}')`);
}
async function section(name){
 await b.click(sel(`link-nav-${name}`));await b.wait(`!!document.querySelector('[data-testid^="row-record-"]')`);
 await b.click('[data-testid^="row-record-"]');await b.wait(`!!document.querySelector('${sel('panel-detail')}')`);
}
async function action(verb){
 await b.click(sel(`button-action-${verb}`));await b.wait(`!!document.querySelector('${sel('dialog-action')}')`);
 assert.equal(await b.evaluate(`document.querySelector('${sel('button-confirm-action')}').disabled`),true);
 await b.fill(sel('input-reason'),'Revisión ficticia de interfaz, sin datos reales');
 if(verb==='assign'){
  await b.click(sel('select-assignee'));await b.wait('document.querySelectorAll(\'[role="option"]\').length===2');
  await b.click('[role="option"]:last-child');
 }
 await b.click(sel('checkbox-confirm'));await b.click(sel('button-confirm-action'));
 await b.wait(`!document.querySelector('${sel('dialog-action')}')`);
}
async function documentRequest(){
 await b.click(sel(`button-open-document-${ids.doc}`));await b.wait(`!!document.querySelector('${sel('dialog-open-document')}')`);
 await b.fill(sel('input-reason'),'Documento ficticio; verificar temporalidad');
 await b.click(sel('checkbox-confirm-document'));await b.click(sel('button-request-document'));
}
try{
 await b.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await b.goto('http://127.0.0.1:18751/admin/');await b.wait('!!window.__fixture');
 await control({reset:true});
 await scenario('access-allowed',login);
 await section('drivers');
 for(const [verb,status] of [['approve','approved'],['suspend','suspended'],['reject','pending_documents']]){
  await scenario(`driver-${verb}`,async()=>{await action(verb);assert.equal((await state()).records.drivers.status,status);await text('Revisión ficticia de interfaz');});
 }
 await scenario('revision-conflict',async()=>{
  await b.click(sel('button-action-approve'));await b.wait(`!!document.querySelector('${sel('dialog-action')}')`);
  await b.fill(sel('input-reason'),'Decisión ficticia sobre una revisión antigua');await b.click(sel('checkbox-confirm'));
  const old=await state(),records=old.records;records.drivers.revision++;
  await control({patch:{records}});
  await b.click(sel('button-confirm-action'));await b.wait(`!!document.querySelector('${sel('text-action-error')}')`);
  await text('Otro cambio');assert.equal((await state()).events.length,old.events.length);
  await b.click(sel('button-cancel-action'));
 });
 await scenario('document-expiration',async()=>{
  await documentRequest();await b.wait(`!!document.querySelector('${sel('link-open-document')}')`);
  const attrs=await b.evaluate(`(()=>{const e=document.querySelector('${sel('link-open-document')}');return {rel:e.rel,referrer:e.referrerPolicy};})()`);
  assert.ok(attrs.rel.includes('noopener')&&attrs.rel.includes('noreferrer'));assert.equal(attrs.referrer,'no-referrer');
  await b.wait(`!document.querySelector('${sel('link-open-document')}')`,6000);await text('venció');
  await b.click(sel('button-close-document'));
 });
 await scenario('document-error',async()=>{
  await control({patch:{docError:true}});await documentRequest();await b.wait(`!!document.querySelector('${sel('text-document-error')}')`);
  assert.equal(await b.evaluate(`!!document.querySelector('${sel('link-open-document')}')`),false);
  await b.click(sel('button-close-document'));await control({patch:{docError:false}});
 });
 await section('vehicles');
 for(const [verb,status] of [['activate','active'],['out_of_service','out_of_service'],['retire','retired']])
  await scenario(`vehicle-${verb}`,async()=>{await action(verb);assert.equal((await state()).records.vehicles.status,status);});
 await section('incidents');
 for(const verb of ['assign','triage','review','resolve','close','reopen'])
  await scenario(`incident-${verb}`,async()=>{await action(verb);if(verb==='assign')assert.equal((await state()).records.incidents.assigneeId,ids.admin);});
 await section('support');
 for(const verb of ['assign','resolve','close','reopen'])
  await scenario(`support-${verb}`,async()=>{await action(verb);if(verb==='assign')assert.equal((await state()).records.support.assigneeId,ids.admin);});
 for(const name of ['trips','pricing'])
  await scenario(`${name}-readonly`,async()=>{await section(name);assert.equal(await b.evaluate('document.querySelectorAll(\'[data-testid^="button-action-"]\').length'),0);});
 await scenario('access-denied-clears-private-ui',async()=>{
  await control({patch:{denied:true}});await b.click(sel('button-refresh-list'));await text('Tu cuenta no tiene permiso');
  assert.equal(await b.evaluate(`!!document.querySelector('${sel('panel-detail')}')`),false);
 });
}catch(error){console.error(String(error));console.error(b.errors);process.exitCode=1;}
finally{
 await writeFile(`${root}/results.json`,JSON.stringify({kind:'real-browser-simulated-services',scenarios:results,
  limits:['No real Supabase/Auth/RLS/Storage','No legal or commercial approval','Fixture transitions do not replace SQL tests']},null,2));
 await b.close();
 console.log(JSON.stringify(results,null,2));
}
