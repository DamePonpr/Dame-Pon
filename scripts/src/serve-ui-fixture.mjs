// Test-only static server. No proxying, credentials, remote requests or writes.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(process.argv[2]??'/tmp/damepon-phase4-ui-required');
const port=Number(process.argv[3]??18749);
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'||req.url?.startsWith('/api/')){
    res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({code:'fixture_required',message:'Solo pruebas controladas; no hay backend remoto.'}));return;
  }
  try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep))throw new Error('path');
    let file=path;
    try {if(!(await stat(file)).isFile())file=resolve(root,'index.html');}
    catch{file=resolve(root,'index.html');}
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
}).listen(port,'127.0.0.1',()=>process.stdout.write(`UI de pruebas aislada en http://127.0.0.1:${port}\n`));
