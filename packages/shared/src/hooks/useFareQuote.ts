import { useEffect,useState } from 'react';
import { fetchFareQuote,quotesRequired } from '../lib/quoteClient';
import type { FareQuote,QuotePoint } from '../lib/quotePolicy';

const monotonic=()=>globalThis.performance?.now()??Date.now();
export function useFareQuote(userId:string,origin:QuotePoint|null,destination:QuotePoint|null,active=true) {
  const required=quotesRequired();
  const key=JSON.stringify([userId,origin?.latitude,origin?.longitude,origin?.address,
    destination?.latitude,destination?.longitude,destination?.address,active]);
  const [attempt,setAttempt]=useState(0);
  const [clock,setClock]=useState(monotonic());
  const [state,setState]=useState<{key:string;quote:FareQuote|null;until:number;message:string;loading:boolean}>(
    {key:'',quote:null,until:0,message:'Selecciona origen y destino.',loading:false});
  useEffect(()=>{if(!required)return;const t=setInterval(()=>setClock(monotonic()),1000);return()=>clearInterval(t);},[required]);
  useEffect(()=>{
    if(!required||!active) return;
    let alive=true;const controller=new AbortController();
    if(!origin||!destination) {setState({key,quote:null,until:0,message:'Selecciona origen y destino para cotizar.',loading:false});return;}
    setState({key,quote:null,until:0,message:'Consultando cotización del servidor…',loading:true});
    const started=monotonic();
    void fetchFareQuote({origin,destination,vehicleType:'sedan'},controller.signal).then(q=>{
      if(alive) setState({key,quote:q,until:started+Date.parse(q.expiresAt)-Date.parse(q.serverTime),
        message:'Cotización fija del servidor. Confirmar crea el viaje, no un cobro.',loading:false});
    }).catch(error=>{if(alive)setState({key,quote:null,until:0,
      message:error instanceof Error?error.message:'Cotización no disponible.',loading:false});});
    return()=>{alive=false;controller.abort();};
  // Selection/identity key fences late responses independently of transport abort.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,attempt,required]);
  const current=state.key===key?state:null;
  const expired=!!current?.quote&&Math.max(clock,monotonic())>=current.until;
  return {required,quote:!expired?current?.quote??null:null,
    loading:required?current?.loading??!!(origin&&destination):false,
    message:!required?'Sin cotización comercial en la app. No se realiza ningún cobro.'
      :expired?'La cotización venció. Solicita una nueva.':current?.message??'Preparando cotización…',
    retry:()=>setAttempt(n=>n+1)};
}
