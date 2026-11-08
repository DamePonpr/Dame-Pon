import {Router,type Request,type Response,type IRouter} from 'express';
import {
  GetAdminConfigResponse,GetAdminSessionResponse,GetAdminOverviewResponse,GetAdminAssigneesResponse,
  GetAdminRecordsQueryParams,GetAdminRecordsResponse,GetAdminDetailParams,GetAdminDetailResponse,
  RunAdminActionBody,RunAdminActionResponse,OpenAdminDocumentBody,OpenAdminDocumentResponse,
} from '@workspace/api-zod';
import {AdminFault,adminPublicConfig,remoteAdminGateway,safeDocumentPath,type AdminGateway} from '../admin/gateway';

export function adminRouter(options:{enabled?:()=>boolean;gateway?:AdminGateway}={}):IRouter {
  const router=Router();
  const enabled=options.enabled??(()=>adminPublicConfig().enabled);
  router.use('/admin',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');next();});
  router.get('/admin/config',(_req,res)=>{res.json(GetAdminConfigResponse.parse(adminPublicConfig()));});
  function guarded(fn:(req:Request,res:Response,g:AdminGateway,token:string,session:unknown)=>Promise<void>){
    return async(req:Request,res:Response):Promise<void>=>{
      try{
        if(!enabled())throw new AdminFault(503,'admin_unavailable','Panel preparado, todavía no conectado ni habilitado.');
        const token=/^Bearer (\S+)$/i.exec(req.headers.authorization??'')?.[1];
        if(!token)throw new AdminFault(401,'unauthorized','Inicia sesión con una cuenta administrativa existente.');
        const gateway=options.gateway??remoteAdminGateway();
        const actor=await gateway.authenticate(token);
        // Independent database authorization with the SAME user JWT, no service role.
        const session=GetAdminSessionResponse.parse(await gateway.rpc(token,'admin_console_session',{}));
        if(session.actorId!==actor)throw new AdminFault(403,'forbidden','La identidad administrativa no coincide.');
        await fn(req,res,gateway,token,session);
      }catch(error){
        const e=error instanceof AdminFault?error:new AdminFault(503,'admin_unavailable','La operación no pudo verificarse. No se confirmó ningún cambio.');
        res.status(e.status).json({code:e.code,error:e.message});
      }
    };
  }
  router.get('/admin/session',guarded(async(_req,res,_g,_t,s)=>{res.json(s);}));
  router.get('/admin/overview',guarded(async(_req,res,g,t)=>{
    res.json(GetAdminOverviewResponse.parse(await g.rpc(t,'admin_console_overview',{})));
  }));
  router.get('/admin/assignees',guarded(async(_req,res,g,t)=>{
    res.json(GetAdminAssigneesResponse.parse(await g.rpc(t,'admin_console_assignees',{})));
  }));
  router.get('/admin/records',guarded(async(req,res,g,t)=>{
    const p=GetAdminRecordsQueryParams.strict().safeParse(req.query);
    if(!p.success){res.status(400).json({error:'Filtro o paginación inválidos.'});return;}
    res.json(GetAdminRecordsResponse.parse(await g.rpc(t,'admin_console_list',{
      p_section:p.data.section,p_offset:p.data.offset??0,p_limit:p.data.limit??25})));
  }));
  router.get('/admin/records/:section/:id',guarded(async(req,res,g,t)=>{
    const p=GetAdminDetailParams.safeParse(req.params);
    if(!p.success){res.status(400).json({error:'Registro inválido.'});return;}
    res.json(GetAdminDetailResponse.parse(await g.rpc(t,'admin_console_detail',{p_section:p.data.section,p_id:p.data.id})));
  }));
  router.post('/admin/actions',guarded(async(req,res,g,t)=>{
    const p=RunAdminActionBody.strict().safeParse(req.body);
    if(!p.success||p.data.reason.trim().length<10){res.status(400).json({error:'Acción inválida. Incluye un motivo de al menos 10 caracteres.'});return;}
    res.json(RunAdminActionResponse.parse(await g.rpc(t,'admin_console_action',{p_input:p.data})));
  }));
  router.post('/admin/documents/open',guarded(async(req,res,g,t)=>{
    const p=OpenAdminDocumentBody.strict().safeParse(req.body);
    if(!p.success||p.data.reason.trim().length<10){res.status(400).json({error:'Documento o motivo inválido.'});return;}
    const ref=await g.rpc(t,'admin_console_document',{p_input:p.data}) as {path?:unknown};
    if(!safeDocumentPath(ref.path))throw new AdminFault(409,'document_path_unsafe','No se puede abrir esta referencia.');
    const issued=Date.now();
    const url=await g.sign(t,ref.path);
    res.json(OpenAdminDocumentResponse.parse({url,expiresAt:new Date(issued+60000).toISOString()}));
  }));
  return router;
}
export default adminRouter();
