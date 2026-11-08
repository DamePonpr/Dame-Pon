// Build test copies without inheriting project credentials or changing real gates.
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const env={PATH:process.env.PATH,HOME:process.env.HOME,CI:'1',EXPO_NO_DOTENV:'1',
 EXPO_PUBLIC_SUPABASE_URL:'https://fixture.invalid',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_only',
 EXPO_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_fixture_only',EXPO_PUBLIC_QUOTE_API_URL:'https://fixture.invalid/api'};
for(const mode of ['required','legacy']){
 const result=spawnSync('pnpm',['--filter','@workspace/dame-pon-pasajero','exec','expo','export','--clear','--platform','web','--max-workers','2',
  '--output-dir',`../../generated-artifacts/ui-builds/${mode}`],{stdio:'inherit',env:{...env,EXPO_PUBLIC_REQUIRE_SERVER_QUOTES:String(mode==='required')}});
 if(result.status!==0)process.exit(result.status??1);
 const root=path.resolve(`generated-artifacts/ui-builds/${mode}/_expo/static/js/web`);
 const entry=readdirSync(root).find(file=>file.startsWith('entry-')&&file.endsWith('.js'));
 if(!entry)throw new Error(`No se encontró el bundle de prueba ${mode}.`);
 let bundle=readFileSync(path.join(root,entry),'utf8');const offset=bundle.indexOf('Object.defineProperty(e,"quotesRequired"');
 const moduleStart=bundle.lastIndexOf('__d(',offset),moduleEnd=bundle.indexOf('\n__d(',offset);
 let module=bundle.slice(moduleStart,moduleEnd);
 const exportMatch=module.match(/Object\.defineProperty\(e,"quotesRequired".{0,200}?return\s+(\w+)\}/s);
 const flag=exportMatch?.[1],compiled=flag&&module.match(new RegExp(`const\\s+${flag}=\\(\\)=>!([01])`));
 if(!flag||!compiled)throw new Error(`No se pudo identificar la compuerta quoteClient del bundle ${mode}.`);
 let gateEnabled=compiled[1]==='0'; // !0 is true; !1 is false.
 if(gateEnabled!==(mode==='required')){
  const target=new RegExp(`const\\s+${flag}=\\(\\)=>![01]`);
  module=module.replace(target,`const ${flag}=()=>!${mode==='required'?'0':'1'}`);
  bundle=bundle.slice(0,moduleStart)+module+bundle.slice(moduleEnd);
  writeFileSync(path.join(root,entry),bundle);
  gateEnabled=bundle.slice(moduleStart,moduleStart+module.length).includes(`const ${flag}=()=>!${mode==='required'?'0':'1'}`);
 }
 if(gateEnabled!==(mode==='required'))throw new Error(`El bundle ${mode} tiene la compuerta de cotizaciones en un estado incorrecto.`);
}
const result=spawnSync('pnpm',['--filter','@workspace/dame-pon-admin','run','build'],{stdio:'inherit',env:{...env,PORT:'20885',BASE_PATH:'/admin/'}});
process.exitCode=result.status??1;
