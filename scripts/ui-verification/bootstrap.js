// Injected ONLY by the loopback fixture server, never imported by production.
(() => {
 const originalFetch=window.fetch.bind(window);
 window.__fixture={control:async data=>{const r=await originalFetch('/__fixture/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return r.json();},
  state:async()=>{const r=await originalFetch('/__fixture/state');return r.json();}};
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input),location.origin);
  if(url.origin===location.origin&&!url.pathname.startsWith('/api/'))return originalFetch(input,init);
  const headers=Object.fromEntries(new Headers(init.headers??input?.headers));
  const r=await originalFetch('/__fixture/net',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({url:url.href,method:init.method??input?.method??'GET',body:init.body,headers}),signal:init.signal});
  if(r.status===599)throw new TypeError('SIMULATED response lost after commit');
  return r;
 };
 class FixtureSocket extends EventTarget{
  readyState=0;constructor(){super();setTimeout(()=>{this.readyState=1;this.onopen?.({});},10);}
  send(data){let m;try{m=JSON.parse(data);}catch{return;}const array=Array.isArray(m);
   const event=array?m[3]:m.event,topic=array?m[2]:m.topic,ref=array?m[1]:m.ref;
   if(event==='phx_join'||event==='heartbeat')setTimeout(()=>this.onmessage?.({data:JSON.stringify(array?[m[0],ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:[]}}]:{topic,ref,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:[]}}})}),10);
  }close(){this.readyState=3;this.onclose?.({code:1000});}addEventListener(...a){super.addEventListener(...a);}
 }
 window.WebSocket=FixtureSocket;
 if(window.__FIXTURE_SESSION__)localStorage.setItem('sb-fixture-auth-token',JSON.stringify(window.__FIXTURE_SESSION__));
})();
