// Dependency-free LOCAL Chromium alternative if the managed browser is unavailable.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createServer} from 'node:net';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function browser(){
 const allocation=createServer();await new Promise(r=>allocation.listen(0,'127.0.0.1',r));
 const port=allocation.address().port;await new Promise(r=>allocation.close(r));
 const home=await mkdtemp(join(tmpdir(),'damepon-browser-'));
 const chrome=spawn(process.env.CHROMIUM_PATH??'/repl/tools/bin/chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-component-update',
  '--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  `--remote-debugging-port=${port}`,`--user-data-dir=${home}`,'about:blank'],
 {env:{PATH:process.env.PATH,HOME:home},stdio:'ignore',detached:true});
 let socket;
 try{
  for(let i=0;i<100;i++){try{const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=tabs.find(t=>t.type==='page')?.webSocketDebuggerUrl;if(socket)break;}catch{}await pause(100);}
  if(!socket)throw Error('Local Chromium did not open its CDP port');
  const ws=new WebSocket(socket);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let next=0;const pending=new Map(),errors=[];
  ws.onmessage=event=>{const m=JSON.parse(String(event.data)),p=pending.get(m.id);
   if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
   if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.description??a.value??'').join(' '));
   if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  function command(method,params={}){
   return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  }
  async function evaluate(expression){
   const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??'Browser expression failed');
   return result.result?.value;
  }
  async function wait(expression,timeout=12000){
   const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await evaluate(expression))return;await pause(100);}
   throw Error('UI timeout: '+expression.slice(0,150));
  }
  async function click(selector){
   const rect=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing selector');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});
   await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
  }
  async function fill(selector,text){
   await click(selector);await command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:2});
   await command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2});
   await command('Input.insertText',{text});
  }
  await command('Page.enable');await command('Runtime.enable');
  return {command,evaluate,wait,click,fill,errors,
   async goto(url){const target=new URL(url);if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!['18749','18750','18751'].includes(target.port))throw Error('Loopback fixture URLs only');
    const navigation=await command('Page.navigate',{url});if(navigation.errorText)throw Error('Local navigation failed: '+navigation.errorText);
    await wait(`location.href===${JSON.stringify(url)}&&document.readyState==="complete"`);},
   async screenshot(path){const r=await command('Page.captureScreenshot',{format:'png'});await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(r.data,'base64'));},
   async close(){ws.close();try{process.kill(-chrome.pid,'SIGTERM');}catch{}await pause(200);await rm(home,{recursive:true,force:true});}};
 }catch(error){try{process.kill(-chrome.pid,'SIGTERM');}catch{}await rm(home,{recursive:true,force:true});throw error;}
}
