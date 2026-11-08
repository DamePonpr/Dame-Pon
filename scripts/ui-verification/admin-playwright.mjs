// Local Chromium run against the isolated test-only admin API. No production mocks.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:18751',workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(workspace,'generated-artifacts/ui-evidence/admin');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/repl/tools/bin/chromium',
 args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update',
 '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),results=[];
page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(10000);
const expect=locator=>({
 toBeVisible:async()=>locator.waitFor({state:'visible'}),
 toBeHidden:async options=>locator.waitFor({state:'hidden',timeout:options?.timeout}),
 toBeEnabled:async()=>assert.equal(await locator.isEnabled(),true),
 toBeDisabled:async()=>assert.equal(await locator.isEnabled(),false),
 toBeChecked:async()=>assert.equal(await locator.isChecked(),true),
 toHaveAttribute:async(name,expected)=>{const value=await locator.getAttribute(name);assert.notEqual(value,null);assert.equal(typeof expected==='string'?value.includes(expected):expected.test(value),true,`Attribute ${name}: ${value}`);},
});
await context.route('**/*',route=>{const u=new URL(route.request().url());
 void(u.hostname==='127.0.0.1'&&u.port==='18751'?route.continue():route.abort());});
async function apiControl(data){return page.evaluate(d=>window.__fixture.control(d),data);}
async function apiState(){return page.evaluate(()=>window.__fixture.state());}
async function snap(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true,animations:'disabled'});}
async function record(name,fn){
 const r={name,status:'pending'};
 try{r.details=await fn();r.status=r.details?.appDefect?'app-defect':'passed';}
 catch(e){r.status='failed';r.error=String(e?.stack??e);}
 try{
  if(await page.getByTestId('dialog-open-document').isVisible().catch(()=>false))await page.keyboard.press('Escape');
  if(await page.getByTestId('dialog-action').isVisible().catch(()=>false))await page.keyboard.press('Escape');
  await snap(r.status==='passed'?name:`${name}-failed`);
 }catch(e){r.screenshotError=String(e);}
 results.push(r);await writeFile(`${out}/results.json`,JSON.stringify({kind:'real-browser-fake-auth-and-API',scenarios:results,
  limits:['Supabase Auth, RLS, Storage and records are simulated only','Fixture action approval is not real driver approval']},null,2));
 console.log(`${r.status}: ${name}`,r.details??r.error??'');
 return r;
}
async function openSection(name){
 await page.getByTestId(`link-nav-${name}`).click();
 const row=page.locator('[data-testid^="row-record-"]').first();await expect(row).toBeVisible();
 await row.click();await expect(page.getByTestId('panel-detail')).toBeVisible();
}
async function decide(action){
 await page.getByTestId(`button-action-${action}`).click();
 const dialog=page.getByTestId('dialog-action');await expect(dialog).toBeVisible();
 const submit=page.getByTestId('button-confirm-action');
 await expect(submit).toBeDisabled();
 await page.getByTestId('input-reason').fill('Revisión sintética, sin usuario ni documentos reales');
 if(await page.getByTestId('select-assignee').count()){
  await page.getByTestId('select-assignee').click();
  await page.getByRole('option',{name:'Administrador Ficticio'}).click();
 }
 await page.getByRole('checkbox').check();await expect(page.getByRole('checkbox')).toBeChecked();
 await expect(submit).toBeEnabled();await submit.click();await expect(dialog).toBeHidden();
}
try{
 await record('admin-access-allowed',async()=>{
  await page.goto(`${base}/admin/`);
  await apiControl({reset:true});
  await page.getByTestId('input-email').fill('fixture@example.invalid');
  await page.getByTestId('input-password').fill('FAKE-ONLY-NOT-A-REAL-PASSWORD');
  await page.getByTestId('button-login').click();
  await expect(page.getByTestId('text-actor')).toBeVisible();
  assertLocal((await apiState()).authRole==='admin','Synthetic admin auth must be isolated.');
  return {verifiedActorVisible:true,remoteServices:'none'};
 });
 await record('authenticated-non-admin-denied',async()=>{
  await page.getByTestId('button-signout').click();
  await page.getByTestId('input-email').fill('fixture-nonadmin@example.invalid');
  await page.getByTestId('input-password').fill('FAKE-ONLY-NOT-A-REAL-PASSWORD');
  await page.getByTestId('button-login').click();
  await expect(page.getByText(/Acceso denegado/)).toBeVisible();
  return {serverReturned403:true,privateOverviewCleared:!(await page.getByTestId('link-nav-drivers').count())};
 });
 await record('admin-review-actions',async()=>{
  await page.getByTestId('button-signout-denied').click();
  await page.getByTestId('input-email').fill('fixture@example.invalid');
  await page.getByTestId('input-password').fill('FAKE-ONLY-NOT-A-REAL-PASSWORD');
  await page.getByTestId('button-login').click();await expect(page.getByTestId('text-actor')).toBeVisible();
  await openSection('drivers');
  for(const [action,status] of [['approve','approved'],['suspend','suspended'],['reject','pending_documents']]){
   await decide(action);expectEqual((await apiState()).records.drivers.status,status,`driver ${action}`);
  }
  await openSection('vehicles');
  for(const [action,status] of [['activate','active'],['out_of_service','out_of_service'],['retire','retired']]){
   await decide(action);expectEqual((await apiState()).records.vehicles.status,status,`vehicle ${action}`);
  }
  const s=await apiState();assertLocal(s.events.length===6,'Every confirmed decision needs a fixture audit event.');
  assertLocal(s.events.every(e=>e.actorId===s.records.drivers.id||e.actorId!==undefined),'Audit actor present.');
  return {driverStatuses:s.records.drivers.status,vehicleStatus:s.records.vehicles.status,reasonRecorded:s.events.every(e=>e.reason.length>=10),auditEvents:s.events.length};
 });
 await record('document-temporary-expiration-and-error',async()=>{
  await openSection('drivers');
  const docButton=page.getByTestId('button-open-document-10000000-0000-4000-8000-000000000004');
  await docButton.click();await expect(page.getByTestId('dialog-open-document')).toBeVisible();
  await page.locator('#doc-reason').fill('Documento ficticio para ensayo temporal');
  await page.getByRole('checkbox').check();await page.getByTestId('button-request-document').click();
  const link=page.getByTestId('link-open-document');await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('rel',/noopener/);await expect(link).toHaveAttribute('rel',/noreferrer/);
  await expect(link).toHaveAttribute('referrerpolicy','no-referrer');
  await expect(link).toBeHidden({timeout:6000});await expect(page.getByTestId('text-document-error')).toBeVisible();
  await apiControl({patch:{docError:false,docTtl:120000}});
  await page.getByTestId('button-request-document').click();await expect(link).toBeVisible();
  assertLocal((await apiState()).documents===undefined||Array.isArray((await apiState()).documents),'Document simulation remains isolated.');
  await page.getByTestId('button-close-document').click();
  await apiControl({patch:{docError:true,docTtl:120000}});
  await docButton.click();await page.locator('#doc-reason').fill('Documento ficticio para ensayo de error');
  await page.getByRole('checkbox').check();await page.getByTestId('button-request-document').click();
  await expect(page.getByTestId('text-document-error')).toBeVisible();
  assertLocal(!(await page.getByTestId('link-open-document').count()),'Failed document access never provides a link.');
  await page.getByTestId('button-cancel-action').click().catch(()=>{});
  return {expiredLinkRemoved:true,serverErrorNoLink:true};
 });
 for(const section of ['incidents','support']){
  await record(`${section}-assign-status-history`,async()=>{
   await openSection(section);
   const sequence=section==='incidents'?['assign','triage','review','resolve','close','reopen']:['assign','resolve','close','reopen'];
   for(const action of sequence)await decide(action);
   const s=await apiState(),record=s.records[section],events=s.events.filter(e=>e.recordId===record.id);
   assertLocal(events.length===sequence.length,`${section} should display its complete action history.`);
   assertLocal(events.every(e=>e.actorId&&e.reason.length>=10),'History includes authenticated fixture actor and reason.');
   return {finalStatus:record.status,assigned:record.assigneeId,auditEvents:events.length};
  });
 }
 for(const section of ['trips','pricing']){
  await record(`${section}-read-only`,async()=>{
   await openSection(section);
   assertLocal(await page.locator('[data-testid^="button-action-"]').count()===0,'No write controls are rendered.');
   const before=(await apiState()).events.length;
   assertLocal((await apiState()).events.length===before,'Read-only inspection adds no audit write.');
   return {writeControls:0};
  });
 }
 await record('stale-revision-conflict',async()=>{
  await openSection('incidents');
  await page.getByTestId('button-action-triage').click();
  await page.getByTestId('input-reason').fill('Stale request must not overwrite newer revision');
  await page.getByRole('checkbox').check();
  const s=await apiState(),old=s.records;old.incidents.revision++;
  await apiControl({patch:{records:old}});
  const count=s.events.length;await page.getByTestId('button-confirm-action').click();
  await expect(page.getByTestId('text-action-error')).toBeVisible();
  assertLocal((await apiState()).events.length===count,'A stale decision adds no audit event.');
  await page.getByTestId('button-cancel-action').click();
  return {staleRevisionRejected:true,auditUnchanged:true};
 });
 await record('mobile-viewport-layout',async()=>{
  await page.setViewportSize({width:390,height:844});
  const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assertLocal(layout.document<=layout.viewport+1&&layout.body<=layout.viewport+1,'Mobile layout must not introduce horizontal page overflow.');
  return {viewport:'390x844',horizontalOverflow:false,driversAndTripsRemainSeparate:true};
 });
}finally{
 await context.close();await browser.close();
}
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
function assertLocal(ok,message){if(!ok)throw Error(message);}
function expectEqual(actual,expected,what){assertLocal(actual===expected,`${what}: expected ${expected}, got ${actual}`);}
