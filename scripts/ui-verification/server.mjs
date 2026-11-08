// Loopback-only static fixture server. No proxy, remote fetch, DB or secrets.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {initial,respond,session} from './fixtures.mjs';
const root=resolve(process.argv[2]),port=Number(process.argv[3]),mobile=process.argv[4]!=='admin';
let state=initial();
const bootstrap=await readFile(new URL('./bootstrap.js',import.meta.url),'utf8');
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;");
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw Error('large');}
  const u=new URL(req.url,'http://fixture.local'),p=u.pathname;
  if(p==='/__fixture/state')return send(state);
  if(p==='/__fixture/control'){const command=JSON.parse(body);if(command.reset)state=initial();Object.assign(state,command.patch??{});
   if(command.tripStatus)for(const t of state.trips){t.status=command.tripStatus;if(t.status==='completed'){t.fare_final=t.fare_estimate;t.completed_at=new Date().toISOString();}}
   return send({ok:true});}
  if(p==='/__fixture/net'){
   const input=JSON.parse(body);let data;try{data=JSON.parse(input.body??'null');}catch{data=input.body;}
   const reply=await respond(state,input.url,input.method,data,input.headers);
   return send(reply.data,reply.status);
  }
  if(req.method!=='GET'||p.startsWith('/api/'))return send({error:'Fixture required'},503);
  // Admin build has /admin/ asset prefix. Mobile exports are mounted at root.
  const path=resolve(root,'.'+(mobile?p:p.replace(/^\/admin(?=\/)/,'')));
  if(path!==root&&!path.startsWith(root+sep))return send({error:'path'},404);
  let file=path;try{if(!(await stat(file)).isFile())file=resolve(root,'index.html');}catch{file=resolve(root,'index.html');}
  let bytes=await readFile(file),extension=extname(file);
  if(extension==='.html')bytes=Buffer.from(bytes.toString().replace('<head>',`<head><script>window.__FIXTURE_SESSION__=${mobile?JSON.stringify(session()):'null'};${bootstrap}</script>`));
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'})[extension]??'application/octet-stream'});res.end(bytes);
 }catch(error){send({error:'Fixture failed',message:String(error)},500);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Isolated fixtures on http://127.0.0.1:${port}`));
