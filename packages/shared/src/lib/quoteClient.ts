import { Platform } from 'react-native';
import { supabase } from './supabase';
import { quoteMatches,type FareQuote,type QuoteRequest } from './quotePolicy';

export const quotesRequired=()=>process.env.EXPO_PUBLIC_REQUIRE_SERVER_QUOTES==='true';
export class QuoteClientError extends Error {
  code:string;
  constructor(message:string,code:string){super(message);this.code=code;}
}
export async function quoteApi(path:string,body:unknown,signal?:AbortSignal):Promise<any> {
  const configured=process.env.EXPO_PUBLIC_QUOTE_API_URL?.replace(/\/$/,'');
  const base=configured??(Platform.OS==='web'?'/api':null);
  if(!base||(configured&&!/^https:\/\/[^?#]+\/api$/.test(configured))) throw new Error('Cotización no disponible: falta configurar el API seguro.');
  const session=await supabase.auth.getSession();
  if(!session.data.session?.access_token) throw new Error('Inicia sesión para cotizar.');
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted) controller.abort();
  const timer=setTimeout(abort,15_000);
  try {
    const response=await fetch(`${base}${path}`,{method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},
      body:JSON.stringify(body)});
    const value=await response.json();
    if(!response.ok) throw new QuoteClientError(value.code==='quote_expired'?'La cotización venció. Solicita otra.'
      :'Cotización no disponible. No se ha cobrado ni inventado un precio.',typeof value.code==='string'?value.code:'quote_unavailable');
    return value;
  } catch(error) {
    if(controller.signal.aborted) throw new Error('La cotización tardó demasiado o fue cancelada. Reintenta sin realizar cobros.');
    if(error instanceof TypeError) throw new Error('No se pudo conectar al servicio de cotizaciones. Revisa la red.');
    throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function fetchFareQuote(input:QuoteRequest,signal?:AbortSignal):Promise<FareQuote> {
  const q=await quoteApi('/quotes',input,signal) as FareQuote;
  if(!q||q.currency!=='USD'||q.vehicleType!=='sedan'||!q.id||!q.ruleVersionId
    ||q.policyVersion!=='fixed-route-v1'||!Number.isSafeInteger(q.totalCents)||q.totalCents<0||q.totalCents>99_999_999
    ||!quoteMatches(q,input.origin,input.destination)||!Number.isFinite(Date.parse(q.expiresAt)-Date.parse(q.serverTime))
    ||Date.parse(q.expiresAt)<=Date.parse(q.serverTime)||!q.breakdown||typeof q.breakdown!=='object'
    ||!Number.isSafeInteger(q.distanceMm)||q.distanceMm<1||!Number.isSafeInteger(q.durationMs)||q.durationMs<1)
    throw new Error('Respuesta de cotización inválida.');
  return q;
}
