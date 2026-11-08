import { createMapTransport, isPuertoRicoPoint, PHOTON_URL, PR_BBOX, RouteError } from './roadRouting';
export interface AddressResult { latitude: number; longitude: number; address: string }
export function photonAddresses(json: any): AddressResult[] {
  if (!Array.isArray(json?.features)) throw new RouteError('unavailable');
  const found = new Map<string,AddressResult>();
  for (const feature of json.features) {
    const p = feature?.properties;
    const xy = feature?.geometry?.coordinates;
    if (!p || feature.geometry.type !== 'Point' || !Array.isArray(xy)
      || !isPuertoRicoPoint({longitude:xy[0],latitude:xy[1]})) continue;
    // A municipality centroid is not a confirmed pickup/dropoff address.
    if (p.osm_key==='boundary' || (p.osm_key==='place' && !['house','isolated_dwelling'].includes(p.osm_value))) continue;
    if (['city','town','village','state','county','country','municipality','suburb','district',
      'administrative','postcode','postal_code','island','hamlet','locality','neighbourhood'].includes(p.osm_value)) continue;
    const street = [p.housenumber,p.street].filter(Boolean).join(' ');
    const address = [...new Set([p.name,street,p.city ?? p.town ?? p.district,p.postcode,'Puerto Rico']
      .filter((v): v is string => typeof v === 'string' && !!v.trim()))].join(', ');
    if (!p.name && !street) continue;
    const result = {longitude:xy[0],latitude:xy[1],address};
    found.set(`${address}:${xy[0]}:${xy[1]}`,result);
  }
  return [...found.values()];
}
export function createAddressSearch(transport = createMapTransport(), now = Date.now) {
  const cache = new Map<string,{at:number;results:AddressResult[]}>();
  return async (query: string, signal?: AbortSignal) => {
    if (signal?.aborted) throw new RouteError('cancelled');
    const trimmed = query.trim().normalize('NFC');
    if (trimmed.length<3) return [];
    if (trimmed.length>180) throw new RouteError('invalid_destination');
    const key = trimmed.toLocaleLowerCase('es-PR');
    const previous = cache.get(key);
    if (previous && now()-previous.at<5*60_000) return previous.results.map(v=>({...v}));
    const json = await transport(`${PHOTON_URL}?q=${encodeURIComponent(`${trimmed}, Puerto Rico`)}&limit=6&bbox=${PR_BBOX}`,signal);
    if (signal?.aborted) throw new RouteError('cancelled');
    const results = photonAddresses(json);
    cache.delete(key); cache.set(key,{at:now(),results});
    while(cache.size>32) cache.delete(cache.keys().next().value!);
    return results.map(v=>({...v}));
  };
}
export const searchAddresses = createAddressSearch();
