import { createHash } from 'node:crypto';
import { requestRoadRoute, isPuertoRicoPoint } from '@workspace/dame-pon-shared/lib/roadRouting';
import { calculateQuote, polygonContains, QuoteFailure, type QuoteRequest, type FareVersion } from '@workspace/dame-pon-shared/lib/quotePolicy';

type Context={enabled:boolean;areas:{id:string;municipio_id:string;nombre:string;geometry:unknown}[];rules:FareVersion[]};
export type QuoteDependencies={
  authenticate:(token:string)=>Promise<string>;
  rpc:(name:string,args:Record<string,unknown>)=>Promise<any>;
  route:typeof requestRoadRoute;
};
// Injectable boundaries enable local tests with NO remote requests.
export function createQuoteService(deps:QuoteDependencies) {
  async function context(actor:string):Promise<Context> {
    const value=await deps.rpc('quote_server_context',{p_actor:actor});
    if(!value?.enabled) throw new QuoteFailure('quotes_unavailable');
    return value;
  }
  return {
    async create(actor:string,input:QuoteRequest) {
      if(!isPuertoRicoPoint(input.origin)||!isPuertoRicoPoint(input.destination)
        ||input.vehicleType!=='sedan') throw new QuoteFailure('invalid_endpoints',400);
      const ctx=await context(actor);
      const municipality=(point:QuoteRequest['origin'])=>{
        const matches=ctx.areas.filter(area=>polygonContains(area.geometry,point));
        if(matches.length!==1) throw new QuoteFailure('municipality_unavailable');
        return matches[0]!;
      };
      const origin=municipality(input.origin),destination=municipality(input.destination);
      const specific=ctx.rules.filter(r=>r.vehicle_type===input.vehicleType&&r.municipio_id===origin.municipio_id);
      const candidates=specific.length?specific:ctx.rules.filter(r=>r.vehicle_type===input.vehicleType&&r.municipio_id===null);
      if(candidates.length!==1) throw new QuoteFailure('approved_rule_unavailable');
      const rule=candidates[0]!;
      // NO client metrics, cache timestamp or price is accepted.
      const route=await deps.route(input.origin,input.destination);
      const distanceMm=Math.round(route.distanceMeters*1000),durationMs=Math.round(route.durationSeconds*1000);
      const result=calculateQuote(rule,distanceMm,durationMs);
      return deps.rpc('quote_server_store',{
        p_actor:actor,p_input:input,p_rule:rule.id,p_origin_area:origin.id,
        p_destination_area:destination.id,p_distance_mm:distanceMm,p_duration_ms:durationMs,
        p_route_hash:createHash('sha256').update(JSON.stringify(route.coordinates)).digest('hex'),
        // SQL recomputes this; disagreement fails closed.
        p_expected_cents:result.totalCents,
      });
    },
    async confirm(actor:string,quoteId:string,key:string) {
      return {tripId:await deps.rpc('quote_server_confirm',{p_actor:actor,p_quote:quoteId,p_key:key})};
    },
  };
}
export function remoteQuoteDependencies():QuoteDependencies {
  // No values accessed/logged on startup, no DB connection, never uses DATABASE_URL.
  const base=(process.env.SUPABASE_URL??process.env.EXPO_PUBLIC_SUPABASE_URL??'').replace(/\/$/,'');
  const publicKey=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY??'';
  const privateKey=process.env.SUPABASE_SERVICE_ROLE_KEY??'';
  async function json(path:string,key:string,token:string,body?:unknown) {
    if(!base.startsWith('https://')||!key||!token) throw new QuoteFailure('quotes_not_configured');
    const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',
      headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12_000)});
    if(!response.ok) {
      // Map known SQL domain errors only. Never echo SQL, personal data or credentials.
      const error=await response.json().catch(()=>null) as {message?:string}|null;
      const known=['quote_expired','quote_used','idempotency_conflict','quote_forbidden','quotes_unavailable'];
      if(known.includes(error?.message??'')) throw new QuoteFailure(error!.message!,409);
      throw new QuoteFailure(response.status===401?'unauthenticated':'quotes_unavailable',response.status===401?401:503);
    }
    return response.json();
  }
  return {
    async authenticate(token) {
      const user=await json('/auth/v1/user',publicKey,token) as {id?:string};
      if(!user.id) throw new QuoteFailure('unauthenticated',401);
      const profiles=await json(`/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`,publicKey,token) as {role:string}[];
      if(profiles.length!==1||profiles[0]?.role!=='pasajero') throw new QuoteFailure('passenger_required',403);
      return user.id;
    },
    rpc:(name,args)=>json(`/rest/v1/rpc/${name}`,privateKey,privateKey,args),
    route:requestRoadRoute,
  };
}
