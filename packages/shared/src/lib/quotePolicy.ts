// Pure shared contract/calculator. No Auth, storage, GPS, default/example rates or charges.
export type QuotePoint={latitude:number;longitude:number;address:string};
export type QuoteRequest={origin:QuotePoint;destination:QuotePoint;vehicleType:'sedan'};
export type FareVersion={
  id:string;municipio_id:string|null;vehicle_type:string;commercial_approved:boolean;
  currency:string;algorithm:string;minimum_policy:string;night_policy:string;
  base_cents:number;per_km_cents:number;per_min_cents:number;minimum_cents:number;
};
export type FareQuote={
  id:string;currency:'USD';totalCents:number;origin:QuotePoint;destination:QuotePoint;vehicleType:'sedan';
  expiresAt:string;serverTime:string;ruleVersionId:string;policyVersion:'fixed-route-v1';
  distanceMm:number;durationMs:number;breakdown:Record<string,unknown>;
};
export class QuoteFailure extends Error {
  code:string;status:number;
  constructor(code:string,status=503) {super(code);this.code=code;this.status=status;}
}
export function calculateQuote(rule:FareVersion,distanceMm:number,durationMs:number) {
  if(!rule.commercial_approved||rule.currency!=='USD'||rule.algorithm!=='fixed-route-v1'
    ||rule.minimum_policy!=='floor_total'||rule.night_policy!=='explicitly_not_applicable') throw new QuoteFailure('approved_rule_unavailable');
  const amounts=[rule.base_cents,rule.per_km_cents,rule.per_min_cents,rule.minimum_cents];
  if(amounts.some(v=>!Number.isSafeInteger(v)||v<0||v>2_147_483_647)
    ||!Number.isSafeInteger(distanceMm)||distanceMm<1||distanceMm>700_000_000
    ||!Number.isSafeInteger(durationMs)||durationMs<1||durationMs>86_400_000) throw new QuoteFailure('invalid_quote_inputs',400);
  const distance=BigInt(rule.per_km_cents)*BigInt(distanceMm),time=BigInt(rule.per_min_cents)*BigInt(durationMs);
  const denominator=3_000_000n;
  const raw=BigInt(rule.base_cents)*denominator+distance*3n+time*50n;
  const floor=BigInt(rule.minimum_cents)*denominator;
  const numerator=raw>floor?raw:floor;
  const totalCents=Number((numerator+denominator/2n)/denominator);
  if(!Number.isSafeInteger(totalCents)||totalCents>99_999_999) throw new QuoteFailure('quote_out_of_range');
  return {totalCents,breakdown:{
    baseCents:rule.base_cents,distanceCents:{numerator:distance.toString(),denominator:1_000_000},
    timeCents:{numerator:time.toString(),denominator:60_000},minimumCents:rule.minimum_cents,
    minimumApplied:raw<floor,rounding:'HALF_UP_FINAL_CENT',minimumPolicy:rule.minimum_policy,
    nightPolicy:rule.night_policy,totalCents,
  }};
}
export function quoteMatches(q:FareQuote|null,origin:QuotePoint|null,destination:QuotePoint|null) {
  return !!q&&!!origin&&!!destination&&q.origin.latitude===origin.latitude&&q.origin.longitude===origin.longitude
    &&q.destination.latitude===destination.latitude&&q.destination.longitude===destination.longitude
    &&q.origin.address===origin.address&&q.destination.address===destination.address;
}
// Reject ambiguous/shared boundaries and holes. Approved polygons, NOT nearest centroid.
export function polygonContains(geometry:any,point:{latitude:number;longitude:number}):boolean {
  const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
  if(!Array.isArray(polygons)||!polygons.length) throw new QuoteFailure('municipality_unavailable');
  const ring=(coords:any):boolean=>{
    if(!Array.isArray(coords)||coords.length<4||coords.length>20_000) throw new QuoteFailure('municipality_unavailable');
    const first=coords[0],last=coords.at(-1);
    if(first?.[0]!==last?.[0]||first?.[1]!==last?.[1]) throw new QuoteFailure('municipality_unavailable');
    let inside=false;
    for(let i=0,j=coords.length-1;i<coords.length;j=i++) {
      const a=coords[i],b=coords[j];
      if(!Array.isArray(a)||a.length!==2||a.some((v:any)=>!Number.isFinite(v))) throw new QuoteFailure('municipality_unavailable');
      const [x,y]=a,[xx,yy]=b,px=point.longitude,py=point.latitude;
      if(i!==j && (x!==xx||y!==yy) && Math.abs((px-x)*(yy-y)-(py-y)*(xx-x))<1e-10
        &&px>=Math.min(x,xx)&&px<=Math.max(x,xx)&&py>=Math.min(y,yy)&&py<=Math.max(y,yy)) throw new QuoteFailure('municipality_ambiguous');
      if((y>py)!==(yy>py)&&px<(xx-x)*(py-y)/(yy-y)+x) inside=!inside;
    }
    return inside;
  };
  return polygons.some((p:any)=>Array.isArray(p)&&p.length>0&&ring(p[0])&&!p.slice(1).some(ring));
}
