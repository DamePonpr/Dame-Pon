// No Supabase, credentials, prices, driver GPS or persistent storage here.
export interface RoadPoint { latitude: number; longitude: number }
export interface RoadRoute {
  origin: RoadPoint; destination: RoadPoint;
  coordinates: [number, number][];
  distanceMeters: number; durationSeconds: number; calculatedAt: number;
}
export type RouteFailure = 'invalid_origin' | 'invalid_destination' | 'same_point' | 'no_route'
  | 'offline' | 'slow' | 'unavailable' | 'cancelled' | 'ferry' | 'expired';
export class RouteError extends Error {
  code: RouteFailure;
  retryable: boolean;
  constructor(code: RouteFailure, retryable=false) { super(routeMessages[code]); this.code = code; this.retryable=retryable; }
}
export const routeMessages: Record<RouteFailure, string> = {
  invalid_origin: 'Selecciona un origen válido en Puerto Rico.',
  invalid_destination: 'Selecciona un destino válido en Puerto Rico.',
  same_point: 'El origen y destino son iguales. Selecciona otro punto.',
  no_route: 'No se encontró una carretera conectada entre esos puntos.',
  offline: 'Sin conexión al servicio de rutas. Revisa internet y reintenta.',
  slow: 'El proveedor tarda demasiado. Reintenta cuando recuperes conexión.',
  unavailable: 'Proveedor de rutas temporalmente no disponible.',
  cancelled: 'Consulta cancelada.',
  ferry: 'Esta ruta requiere ferry. No ofrecemos ese recorrido como ruta por carretera.',
  expired:'La estimación de ruta venció. Recalcula antes de solicitar.',
};
export const ROUTER_URL = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
export const PHOTON_URL = 'https://photon.komoot.io/api/';
export const PR_BBOX = '-68,17.8,-65.1,18.6'; // includes Vieques, Culebra and Mona
export function isPuertoRicoPoint(point: RoadPoint | null | undefined): point is RoadPoint {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && point.latitude >= 17.8 && point.latitude <= 18.6 && point.longitude >= -68 && point.longitude <= -65.1;
}
export function routeKey(origin: RoadPoint | null, destination: RoadPoint | null) {
  return [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude].join(':');
}
export function routeMatches(route: RoadRoute | null, origin: RoadPoint | null, destination: RoadPoint | null) {
  return !!route && routeKey(route.origin, route.destination) === routeKey(origin, destination);
}
export function tripRoutePoints(trip: {
  pickup_lat: number | null; pickup_lng: number | null;
  dropoff_lat: number | null; dropoff_lng: number | null;
} | null) {
  if (!trip) return null;
  return {
    origin: { latitude: trip.pickup_lat ?? NaN, longitude: trip.pickup_lng ?? NaN },
    destination: { latitude: trip.dropoff_lat ?? NaN, longitude: trip.dropoff_lng ?? NaN },
  };
}
export function formatRoadRoute(route: RoadRoute) {
  return `${(route.distanceMeters / 1000).toLocaleString('es-PR', { maximumFractionDigits: 1 })} km · ${Math.max(1, Math.ceil(route.durationSeconds / 60))} min estimados`;
}
function abortError() { return new RouteError('cancelled'); }
function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
// One serialized request queue per provider/installation, never GPS-triggered.
// Public demo is not an SLA or a fleet-wide distributed quota solution.
export function createMapTransport(fetcher: typeof fetch = fetch, timeoutMs = 8_000) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  return (url: string, signal?: AbortSignal): Promise<any> => {
    const task = tail.catch(() => {}).then(async () => {
      await delay(Math.max(0, lastStart + 1_100 - Date.now()), signal);
      if (signal?.aborted) throw abortError();
      lastStart = Date.now();
      const controller = new AbortController();
      let rejectStop:(reason:RouteError)=>void=()=>{};
      const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
      const abort = () => {controller.abort();rejectStop(abortError());};
      signal?.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort();rejectStop(new RouteError('slow')); }, timeoutMs);
      try {
        const headers: Record<string,string> = { Accept: 'application/json' };
        if (!(globalThis as { document?: unknown }).document) headers['User-Agent'] = 'DamePon/Phase3 (interactive Puerto Rico maps)';
        const work=async()=>{
        const response = await fetcher(url, { headers, signal: controller.signal });
        const text = await response.text();
        if (text.length > 3_000_000) throw new RouteError('unavailable');
        let json;
        try { json=JSON.parse(text); } catch { throw new RouteError('unavailable'); }
        if (!response.ok && !(response.status===400 && ['NoSegment','NoRoute'].includes(json?.code))) {
          throw new RouteError('unavailable',[502,503,504].includes(response.status));
        }
        return json;
        };
        return await Promise.race([work(),stopped]);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (timedOut) throw new RouteError('slow');
        if (error instanceof RouteError) throw error;
        throw new RouteError('offline',true);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    });
    tail = task.catch(() => {});
    return task;
  };
}

export function parseRoadRoute(json: any, origin: RoadPoint, destination: RoadPoint, now: number): RoadRoute {
  if (json?.code === 'NoRoute' || json?.code === 'NoSegment') throw new RouteError('no_route');
  if (json?.code !== 'Ok') throw new RouteError('unavailable');
  const route = json.routes?.[0];
  const points = route?.geometry?.coordinates;
  if (!Number.isFinite(route?.distance) || route.distance <= 0 || route.distance > 700_000
    || !Number.isFinite(route?.duration) || route.duration <= 0 || route.duration > 24*3600
    || route.geometry?.type !== 'LineString' || !Array.isArray(points) || points.length < 2 || points.length > 30_000
    || points.some((p: unknown) => !Array.isArray(p) || p.length !== 2
      || !isPuertoRicoPoint({ longitude: p[0], latitude: p[1] }))) throw new RouteError('unavailable');
  // No silent snapping to a remote highway or a different island.
  if (!Array.isArray(json.waypoints) || json.waypoints.length !== 2
    || json.waypoints.some((w: any) => !Number.isFinite(w?.distance) || w.distance < 0 || w.distance > 250)) throw new RouteError('no_route');
  // Linear deltas are used ONLY to validate endpoint snapping, never road km/ETA.
  const near=(xy:number[],point:RoadPoint)=>Math.hypot(
    (xy[1]-point.latitude)*111_320,(xy[0]-point.longitude)*111_320*Math.cos(point.latitude*Math.PI/180),
  )<=350;
  if(!near(points[0],origin)||!near(points[points.length-1],destination)) throw new RouteError('no_route');
  if (!Array.isArray(route.legs) || !route.legs.length
    || route.legs.some((leg: any) => !Array.isArray(leg.steps) || !leg.steps.length)) throw new RouteError('unavailable');
  if (route.legs.some((leg: any) => leg.steps.some((step: any) => step?.mode === 'ferry'))) throw new RouteError('ferry');
  if(route.legs.some((leg:any)=>leg.steps.some((step:any)=>step?.mode!=='driving'))) throw new RouteError('unavailable');
  return { origin: { latitude:origin.latitude,longitude:origin.longitude },
    destination: { latitude:destination.latitude,longitude:destination.longitude }, coordinates: points.map((p: [number,number]) => [...p]),
    distanceMeters: route.distance, durationSeconds: route.duration, calculatedAt: now };
}
function cloneRoute(route: RoadRoute): RoadRoute {
  return { ...route, origin: { ...route.origin }, destination: { ...route.destination }, coordinates: route.coordinates.map(p => [...p]) };
}
export function createRoadRouter(transport = createMapTransport(), now = Date.now, retryDelay = 1_100) {
  const cache = new Map<string, RoadRoute>();
  return async (origin: RoadPoint, destination: RoadPoint, signal?: AbortSignal): Promise<RoadRoute> => {
    if (signal?.aborted) throw abortError();
    if (!isPuertoRicoPoint(origin)) throw new RouteError('invalid_origin');
    if (!isPuertoRicoPoint(destination)) throw new RouteError('invalid_destination');
    if (routeKey(origin, origin) === routeKey(destination, destination)) throw new RouteError('same_point');
    const key = routeKey(origin, destination);
    const cached = cache.get(key);
    if (cached && now() - cached.calculatedAt < 5*60_000) {
      cache.delete(key); cache.set(key, cached); return cloneRoute(cached);
    }
    const a = `${origin.longitude},${origin.latitude}`, b = `${destination.longitude},${destination.latitude}`;
    // steps are requested solely to reject ferry segments, not to claim navigation.
    const url = `${ROUTER_URL}/${a};${b}?overview=full&geometries=geojson&steps=true&alternatives=false&radiuses=250;250`;
    for (let attempt=0;attempt<2;attempt++) {
      try {
        const json = await transport(url, signal);
        if (signal?.aborted) throw abortError();
        const result = parseRoadRoute(json, origin, destination, now());
        cache.set(key,result);
        while (cache.size>24) cache.delete(cache.keys().next().value!);
        return cloneRoute(result);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (attempt || !(error instanceof RouteError) || !error.retryable) throw error;
        await delay(retryDelay, signal);
      }
    }
    throw new RouteError('unavailable');
  };
}
export const requestRoadRoute = createRoadRouter();

export interface RouteState { key: string; status: 'idle'|'loading'|'ready'|RouteFailure; route: RoadRoute|null; message: string }
export function createRouteController(
  load: typeof requestRoadRoute,
  emit: (state: RouteState) => void,
) {
  let generation = 0;
  let controller: AbortController | null = null;
  const cancel = () => { generation++; controller?.abort(); controller = null; };
  return {
    cancel,
    async select(key: string, origin: RoadPoint | null, destination: RoadPoint | null) {
      cancel();
      const version = generation;
      const current = new AbortController();
      controller = current;
      const send = (status: RouteState['status'], route: RoadRoute|null, message: string) => {
        if (version === generation) emit({key,status,route,message});
      };
      if (!origin || !destination) return send('idle',null,'Selecciona origen y destino para calcular la ruta.');
      send('loading',null,'Calculando ruta por carretera…');
      try { send('ready',await load(origin,destination,current.signal),'Ruta estimada por carretera, sin tráfico en tiempo real.'); }
      catch (error) {
        if (version !== generation) return;
        const failure = error instanceof RouteError ? error : new RouteError('unavailable');
        if (failure.code !== 'cancelled') send(failure.code,null,failure.message);
      }
    },
  };
}
