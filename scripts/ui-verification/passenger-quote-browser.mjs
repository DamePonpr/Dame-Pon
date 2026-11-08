// Repeatable browser regression runner for the loopback-only passenger exports.
// Start scripts/ui-verification/server.mjs against the isolated exports on
// 127.0.0.1:18749 and :18750 first. No app workflow, database, or remote service
// is started or contacted. Requires Playwright in the runner environment.
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const BASE='http://127.0.0.1:18749', LEGACY='http://127.0.0.1:18750';
const WORKSPACE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=path.join(WORKSPACE,'generated-artifacts/ui-evidence');
for(const u of [BASE,LEGACY])if(new URL(u).hostname!=='127.0.0.1')throw Error('loopback only');
await mkdir(OUT,{recursive:true});
const browser=process.env.CDP_ENDPOINT
  ? await chromium.connectOverCDP(process.env.CDP_ENDPOINT)
  : await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/repl/tools/bin/chromium',args:['--no-sandbox']});
const results={startedAt:new Date().toISOString(),loopbackOnly:true,scenarios:[]};
const context=await browser.newContext({timezoneId:'UTC'});
const page=await context.newPage();
const legacyContext=await browser.newContext({timezoneId:'UTC'});
const legacyPage=await legacyContext.newPage();
page.setDefaultTimeout(8000);legacyPage.setDefaultTimeout(8000);
const loopbackOnly=r=>{
  const u=new URL(r.request().url());
  return u.hostname==='127.0.0.1'&&[18749,18750].includes(Number(u.port))?r.continue():r.abort();
};
await context.route('**/*',loopbackOnly);await legacyContext.route('**/*',loopbackOnly);
async function fixture(p,command){return p.evaluate(c=>window.__fixture.control(c),command);}
async function state(p){return p.evaluate(()=>window.__fixture.state());}
async function reset(p,patch={}){if(!p.url().startsWith('http://127.0.0.1:'))await p.goto(`${p===legacyPage?LEGACY:BASE}/home`);await fixture(p,{reset:true,patch});}
async function save(p,name){
  const file=path.join(OUT,`${name}.png`);
  await p.screenshot({path:file,fullPage:true,animations:'disabled'});return file;
}
async function record(name,p,fn){
  const row={name,status:'passed',startedAt:new Date().toISOString()};
  try{row.details=await fn();if(row.details?.appDefect)row.status='app-defect';}
  catch(e){row.status='failed';row.error=String(e?.stack||e);}
  try{row.screenshot=await save(p,name);}catch(e){row.screenshotError=String(e);}
  row.finishedAt=new Date().toISOString();results.scenarios.push(row);
  await writeFile(path.join(OUT,'passenger-quote-results.json'),JSON.stringify(results,null,2));
  console.log(`${row.status}: ${name}`,row.details||row.error||'');
}
async function homePoints(p,base=BASE){
  await p.goto(`${base}/home`);
  await p.getByRole('textbox',{name:'Buscar origen en Puerto Rico'}).fill('Plaza');
  const plaza=p.getByRole('button',{name:/Plaza Ficticia, 10 Calle Prueba/});await plaza.waitFor();await plaza.click();
  await p.getByRole('textbox',{name:'Buscar destino en Puerto Rico'}).fill('Museo');
  const museo=p.getByRole('button',{name:/Museo Ficticio, 10 Calle Prueba/});await museo.waitFor();await museo.click();
  await p.getByTestId('road-route-status').getByText(/2\.4 km/).waitFor();
}
async function waitQuote(p){await p.getByText(/Cotización fija: \$9\.87 USD/).waitFor();}
async function isEnabled(p){return p.getByTestId('confirm-road-trip').isEnabled();}
async function directConfirm(p,quoteId){
  return p.evaluate(async id=>{
    const r=await fetch('/api/quotes/confirm',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({quoteId:id,idempotencyKey:id})});
    return {status:r.status,body:await r.json()};
  },quoteId);
}

try{
  await record('quote-error-and-recovery',page,async()=>{
    await reset(page,{quoteError:true});await homePoints(page);
    await page.getByText(/Cotización no disponible/).waitFor();
    const blocked=!(await isEnabled(page));
    await page.getByRole('button',{name:'Solicitar nueva cotización'}).click();
    await page.getByText(/Cotización no disponible/).waitFor();
    await fixture(page,{patch:{quoteError:false}});
    await page.getByRole('button',{name:'Solicitar nueva cotización'}).click();
    await waitQuote(page);
    return {errorBlocksConfirm:blocked,recovered:await isEnabled(page),fixture:await state(page)};
  });

  await record('short-ttl-block-and-recovery',page,async()=>{
    await fixture(page,{reset:true});await homePoints(page);await waitQuote(page);
    await fixture(page,{patch:{quoteTtl:2000}});
    await page.getByRole('button',{name:'Solicitar nueva cotización'}).click();await waitQuote(page);
    await page.getByText(/La cotización venció/).waitFor({timeout:6000});
    const blocked=!(await isEnabled(page));
    await fixture(page,{patch:{quoteTtl:120000}});
    await page.getByRole('button',{name:'Solicitar nueva cotización'}).click();await waitQuote(page);
    return {expiredQuoteBlocksConfirm:blocked,recovered:await isEnabled(page),fixture:await state(page)};
  });

  await record('server-expired-confirm-error',page,async()=>{
    await fixture(page,{reset:true,patch:{confirmError:true}});await homePoints(page);await waitQuote(page);
    await page.getByTestId('confirm-road-trip').click();
    await page.getByText('La cotización venció. Solicita otra.').waitFor();
    const s=await state(page),enabled=await isEnabled(page);
    assert.equal(s.trips.length,0,'Expired confirmation must not create a trip');
    assert.equal(enabled,false,'Definitive expiration must invalidate and disable the quote');
    await page.getByRole('button',{name:'Solicitar nueva cotización'}).click();
    await waitQuote(page);
    assert.equal(await isEnabled(page),true,'A fresh server quote can recover from expiry.');
    return {trips:s.trips.length,confirmButtonStillEnabled:enabled,
      appDefect:enabled,requestPaths:s.requests.map(x=>x.path).filter(x=>x.includes('/api/')||/payment|charge/i.test(x))};
  });

  await record('double-click-and-completion',page,async()=>{
    await fixture(page,{reset:true});await homePoints(page);await waitQuote(page);
    await page.getByTestId('confirm-road-trip').dblclick();await page.getByText(/PON ACTIVO/).waitFor();
    const first=await state(page),trip=first.trips[0];
    await fixture(page,{tripStatus:'completed'});await page.waitForTimeout(4500);
    const after=await state(page),text=await page.locator('body').innerText();
    const activeButCompletedHistory=text.includes('Buscando conductor')&&text.includes('Completado');
    assert.equal(first.trips.length,1,'Double click must not create more than one trip');
    assert.equal(first.requests.filter(x=>x.path==='/api/quotes/confirm').length,1,'One UI confirmation must issue one request');
    assert.equal(trip?.payment_status,'pending','A reservation is not a collected payment');
    assert.equal(after.trips[0]?.fare_final,9.87,'The agreed synthetic amount remains frozen at completion');
    await page.waitForTimeout(1000);
    const settledText=await page.locator('body').innerText();
    assert.equal(settledText.includes('Buscando conductor'),false,'Completed trip must not remain in the active-search screen');
    assert.match(text,/Completado/);
    return {tripCountAfterDoubleClick:first.trips.length,confirmRequests:first.requests.filter(x=>x.path==='/api/quotes/confirm').length,
      originalTrip:trip&&{id:trip.id,status:trip.status,fare:trip.fare_estimate,payment_status:trip.payment_status},
      afterCompletion:after.trips.map(t=>({status:t.status,fare:t.fare_final??t.fare_estimate,payment_status:t.payment_status})),
      activeButCompletedHistory,completedLabelVisible:settledText.includes('Completado'),completionUiDefect:activeButCompletedHistory,
      chargePaths:after.requests.map(x=>x.path).filter(x=>/payment|charge/i.test(x))};
  });

  await record('lost-response-same-quote-retry-and-concurrent-contexts',page,async()=>{
    await fixture(page,{reset:true});await homePoints(page);await waitQuote(page);
    await fixture(page,{patch:{confirmLoseResponse:true}});
    await page.getByTestId('confirm-road-trip').click();
    const s1=await state(page),q=s1.quotes.at(-1).id,t1=s1.trips.find(t=>t.quote_id===q);
    const retry=await directConfirm(page,q);
    const second=await context.newPage();await second.goto(`${BASE}/home`);
    const concurrent=await Promise.all([directConfirm(page,q),directConfirm(second,q)]);
    const end=await state(page),matching=end.trips.filter(t=>t.quote_id===q);
    await second.close();
    return {firstTrip:t1?.id,retry,concurrent,matchingTripIds:matching.map(t=>t.id),
      oneTripForQuote:matching.length===1,chargePaths:end.requests.map(x=>x.path).filter(x=>/payment|charge/i.test(x))};
  });

  await record('legacy-export-trip-path',legacyPage,async()=>{
    await legacyPage.goto(`${LEGACY}/home`);await reset(legacyPage);
    await homePoints(legacyPage,LEGACY);
    await legacyPage.getByText(/Sin cotización comercial/).waitFor();
    if(await legacyPage.getByText(/Cotización fija:/).count())throw Error('Legacy mode unexpectedly requested a quote');
    await legacyPage.getByTestId('confirm-road-trip').waitFor();
    const before=await state(legacyPage);
    await legacyPage.getByTestId('confirm-road-trip').click();await legacyPage.getByText(/PON ACTIVO/).waitFor();
    const after=await state(legacyPage),paths=after.requests.map(x=>x.path);
    const quoteConfirm=paths.includes('/api/quotes/confirm');
    const legacyInsert=after.requests.some(x=>x.path==='/rest/v1/trips'&&x.method==='POST');
    assert.equal(quoteConfirm,false,'Legacy mode must retain the old direct trip creation path.');
    assert.equal(legacyInsert,true,'Legacy creation should use the existing trips REST path.');
    assert.equal(after.trips.length,1,'Legacy confirmation should create one synthetic trip');
    return {quotesBeforeConfirm:before.quotes.length,legacyTripInsert:legacyInsert,quoteConfirm,paths:paths.filter(x=>x.includes('/api/')||x.endsWith('/trips')),
      appDefect:false};
  });

  await record('find-ride-to-confirm-request',page,async()=>{
    await fixture(page,{reset:true});await page.goto(`${BASE}/find-ride`);
    const inputs=page.getByRole('textbox',{name:'¿A dónde vas?'});
    await inputs.nth(0).fill('Plaza');await page.getByRole('button',{name:/Plaza Ficticia, 10 Calle Prueba/}).waitFor();
    await page.getByRole('button',{name:/Plaza Ficticia, 10 Calle Prueba/}).click();
    await inputs.nth(1).fill('Museo');await page.getByRole('button',{name:/Museo Ficticio, 10 Calle Prueba/}).waitFor();
    await page.getByRole('button',{name:/Museo Ficticio, 10 Calle Prueba/}).click();
    await page.getByText('Revisar solicitud').click();await page.waitForURL('**/confirm-ride');
    await page.getByText('Continuar').click();await page.waitForURL('**/book-ride');
    await page.getByText('Confirmar solicitud').click();await page.getByText(/Solicitud enviada/).waitFor();
    const s=await state(page);
    return {url:page.url(),trips:s.trips.map(t=>({status:t.status,fare:t.fare_estimate,payment_status:t.payment_status})),
      chargePaths:s.requests.map(x=>x.path).filter(x=>/payment|charge/i.test(x)),success:true};
  });
}finally{
  results.finishedAt=new Date().toISOString();
  await writeFile(path.join(OUT,'passenger-quote-results.json'),JSON.stringify(results,null,2));
  await legacyContext.close();await context.close();
  await browser.close();
}
if(results.scenarios.some(row=>!['passed'].includes(row.status)))process.exitCode=1;
