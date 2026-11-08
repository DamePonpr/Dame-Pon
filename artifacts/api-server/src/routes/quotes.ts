import { Router } from 'express';
import { CreateRideQuoteBody,ConfirmRideQuoteBody } from '@workspace/api-zod';
import { createQuoteService,remoteQuoteDependencies,type QuoteDependencies } from '../quotes/service';
import { QuoteFailure } from '@workspace/dame-pon-shared/lib/quotePolicy';

export function quoteRouter(enabled:()=>boolean=()=>process.env.DAME_PON_QUOTES_ENABLED==='true',deps?:QuoteDependencies) {
  const router=Router();
  const budgets=new Map<string,number>();
  async function handle(req:any,res:any,confirm:boolean) {
    res.set('Cache-Control','no-store');
    try {
      // Default OFF. No Auth, routes, database or public example-rule lookup when off.
      if(!enabled()) throw new QuoteFailure('quotes_unavailable');
      const token=/^Bearer ([^\s]+)$/.exec(req.get('Authorization')??'')?.[1];
      if(!token) throw new QuoteFailure('unauthenticated',401);
      const boundary=deps??remoteQuoteDependencies();
      const actor=await boundary.authenticate(token);
      const service=createQuoteService(boundary);
      if(confirm) {
        const input=ConfirmRideQuoteBody.strict().safeParse(req.body);
        if(!input.success) throw new QuoteFailure('invalid_request',400);
        res.json(await service.confirm(actor,input.data.quoteId,input.data.idempotencyKey));
      } else {
        const input=CreateRideQuoteBody.strict().safeParse(req.body);
        if(!input.success||Object.keys(req.body.origin??{}).some(k=>!['latitude','longitude','address'].includes(k))
          ||Object.keys(req.body.destination??{}).some(k=>!['latitude','longitude','address'].includes(k))) throw new QuoteFailure('invalid_request',400);
        const now=Date.now(),last=budgets.get(actor)??0;
        if(now-last<3000) throw new QuoteFailure('quote_rate_limited',429);
        if(budgets.size>1000) for(const [id,time] of budgets) if(now-time>60_000) budgets.delete(id);
        if(budgets.size>1000&&!budgets.has(actor)) throw new QuoteFailure('quote_rate_limited',429);
        budgets.set(actor,now);
        res.json(await service.create(actor,input.data));
      }
    } catch(error) {
      const failure=error instanceof QuoteFailure?error:new QuoteFailure('quotes_unavailable');
      res.status(failure.status).json({code:failure.code,message:
        failure.status===401?'Inicia sesión para cotizar.':'Cotización no disponible. No se ha realizado ningún cobro.'});
    }
  }
  router.post('/quotes',(req,res)=>handle(req,res,false));
  router.post('/quotes/confirm',(req,res)=>handle(req,res,true));
  return router;
}
export default quoteRouter();
