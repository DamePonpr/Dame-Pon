// Test-only processes, loopback, no production artifact or workflow changes.
import {spawn} from 'node:child_process';
const env={PATH:process.env.PATH,HOME:process.env.HOME};
const children=[
 ['generated-artifacts/ui-builds/required','18749','mobile'],
 ['generated-artifacts/ui-builds/legacy','18750','mobile'],
 ['artifacts/dame-pon-admin/dist/public','18751','admin'],
].map(args=>spawn(process.execPath,['scripts/ui-verification/server.mjs',...args],{env,stdio:'inherit'}));
const stop=()=>children.forEach(p=>p.kill('SIGTERM'));
process.on('SIGINT',stop);process.on('SIGTERM',stop);
for(const child of children)child.on('exit',code=>{if(code){process.exitCode=code;stop();}});
