export class AdminFault extends Error {
  status:number; code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
export interface AdminGateway {
  authenticate(token:string):Promise<string>;
  rpc(token:string,name:string,args:Record<string,unknown>):Promise<unknown>;
  sign(token:string,path:string):Promise<string>;
}
export function safeDocumentPath(path:unknown):path is string {
  return typeof path==='string'&&path.length<1000&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(path)&&
    !/[\\%?#]/.test(path)&&!path.split('/').some(s=>!s||s==='.'||s==='..');
}
export function documentMime(bytes:Uint8Array):string|null {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
  if([37,80,68,70,45].every((n,i)=>bytes[i]===n))return 'application/pdf';
  return null;
}
export function adminPublicConfig(){
  if(process.env.DAME_PON_ADMIN_ENABLED!=='true')return {enabled:false};
  const supabaseUrl=(process.env.SUPABASE_URL??process.env.EXPO_PUBLIC_SUPABASE_URL)?.replace(/\/$/,'');
  const publishableKey=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try{
    const u=new URL(supabaseUrl??'');
    if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!publishableKey)
      return {enabled:false};
  }catch{return {enabled:false};}
  return {enabled:true,supabaseUrl:supabaseUrl!,publishableKey:publishableKey!};
}
const reasons:Record<string,string>={
  revision_conflict:'Otro cambio modificó el registro. Actualiza antes de decidir.',
  idempotency_conflict:'La clave ya se utilizó para otra acción.',
  driver_has_active_trip:'El conductor tiene un viaje activo. No se cambió su operación.',
  document_packet_incomplete:'Faltan documentos aprobados y vigentes, acuerdos o vehículo activo.',
  driver_must_be_suspended:'Suspende al conductor sin viaje activo antes de invalidar sus documentos.',
  invalid_transition:'La transición no es válida para el estado actual.',
  document_expired:'El documento está vencido.',
  assignee_not_admin:'La persona asignada debe ser un administrador existente.',
  document_path_unsafe:'La referencia del documento no es segura.',
};
export function remoteAdminGateway():AdminGateway {
  const config=adminPublicConfig();
  if(!config.enabled||!config.supabaseUrl||!config.publishableKey)
    throw new AdminFault(503,'admin_unavailable','El panel no está conectado. Los cambios SQL siguen pendientes.');
  const base=config.supabaseUrl,key=config.publishableKey;
  async function request(token:string,path:string,init:RequestInit={}){
    const response=await fetch(base+path,{...init,redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...init.headers}});
    const value:unknown=await response.json();
    const detail=value&&typeof value==='object'?value as Record<string,unknown>:{};
    if(!response.ok){
      if(response.status===401)throw new AdminFault(401,'unauthorized','Sesión inválida o vencida.');
      if(detail.code==='42501'||response.status===403)throw new AdminFault(403,'forbidden','Acceso exclusivo para administración.');
      if(detail.message==='not_found')throw new AdminFault(404,'not_found','No se encontró el registro.');
      if(typeof detail.message==='string'&&reasons[detail.message])throw new AdminFault(409,detail.message,reasons[detail.message]);
      throw new AdminFault(503,'admin_unavailable','No se pudo completar la operación. Revisa el esquema pendiente o la conexión.');
    }
    return value;
  }
  return {
    async authenticate(token){
      const user=await request(token,'/auth/v1/user') as {id?:unknown};
      if(typeof user?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(user.id))throw new AdminFault(401,'unauthorized','Sesión inválida.');
      const rows=await request(token,`/rest/v1/profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}`);
      if(!Array.isArray(rows)||rows.length!==1||rows[0]?.role!=='admin'||rows[0]?.id!==user.id)
        throw new AdminFault(403,'forbidden','Esta cuenta no tiene acceso administrativo.');
      return user.id;
    },
    rpc:(token,name,args)=>request(token,`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(args)}),
    async sign(token,path){
      if(!safeDocumentPath(path))throw new AdminFault(409,'document_path_unsafe','Documento no disponible.');
      const encoded=path.split('/').map(encodeURIComponent).join('/');
      // Inspect only a small prefix, never buffer the whole sensitive document.
      // The same JWT/ticket must pass Storage RLS; MIME metadata alone is untrusted.
      const media=await fetch(`${base}/storage/v1/object/authenticated/driver-documents/${encoded}`,{
        redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:key,Authorization:`Bearer ${token}`,Range:'bytes=0-15'}});
      if(!media.ok||!media.body)throw new AdminFault(503,'admin_unavailable','No se pudo verificar el archivo privado.');
      const reader=media.body.getReader(),prefix=new Uint8Array(8);let length=0;
      try{
        for(let i=0;i<16&&length<8;i++){
          const chunk=await reader.read();if(chunk.done)break;
          const part=chunk.value.subarray(0,8-length);prefix.set(part,length);length+=part.length;
        }
      }finally{await reader.cancel().catch(()=>{});}
      const mime=documentMime(prefix.subarray(0,length));
      if(!mime||media.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!==mime)
        throw new AdminFault(409,'unsafe_document_media','El contenido no coincide con una imagen o PDF permitido.');
      const signed=await request(token,`/storage/v1/object/sign/driver-documents/${encoded}`,
        {method:'POST',body:JSON.stringify({expiresIn:60})}) as {signedURL?:unknown};
      if(typeof signed?.signedURL!=='string')throw new AdminFault(503,'admin_unavailable','No se pudo generar el enlace privado.');
      const url=new URL(signed.signedURL.startsWith('/')?'/storage/v1'+signed.signedURL:signed.signedURL,base);
      if(url.origin!==base||!url.pathname.startsWith('/storage/v1/object/sign/driver-documents/'))
        throw new AdminFault(503,'admin_unavailable','Referencia privada inválida.');
      return url.href;
    },
  };
}
