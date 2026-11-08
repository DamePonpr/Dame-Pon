import { useEffect, useRef, useState } from 'react';
import { createRouteController, requestRoadRoute, routeKey, type RoadPoint, type RouteState } from '../lib/roadRouting';

export function useRoadRoute(scope: string, origin: RoadPoint|null, destination: RoadPoint|null) {
  const key = `${scope}:${routeKey(origin,destination)}`;
  const [attempt,setAttempt] = useState(0);
  const [clock,setClock]=useState(Date.now());
  const [state,setState] = useState<RouteState>({key:'',status:'idle',route:null,message:'Selecciona origen y destino.'});
  const controller = useRef<ReturnType<typeof createRouteController>|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),15_000);return ()=>clearInterval(timer);},[]);
  useEffect(()=>{
    const current = createRouteController(requestRoadRoute,setState);
    controller.current=current;
    void current.select(key,origin,destination);
    return ()=>{current.cancel();controller.current=null;};
  // Coordinates, identity and trip form the key, not GPS position/object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,attempt]);
  const visible=state.key===key ? state : {key,status:'loading' as const,route:null,message:'Preparando ruta…'};
  const expired=visible.route && clock-visible.route.calculatedAt>=5*60_000;
  return {
    ...(expired ? {key,status:'expired' as const,route:null,message:'La estimación venció. Recalcula la ruta.'} : visible),
    retry:()=>setAttempt(value=>value+1),
  };
}
