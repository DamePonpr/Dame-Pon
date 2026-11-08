import { ActivityIndicator,Text,View } from 'react-native';
import { AppButton } from './AppButton';
import { useColors } from '../hooks/useColors';
import type { useFareQuote } from '../hooks/useFareQuote';
export function FareQuoteCard({fare}:{fare:ReturnType<typeof useFareQuote>}) {
  const colors=useColors();
  const fraction=(v:unknown)=>{
    const part=v as {numerator?:string;denominator?:number}|null;
    const n=Number(part?.numerator)/Number(part?.denominator);
    return Number.isFinite(n)?n.toLocaleString('es-PR',{maximumFractionDigits:4}):'—';
  };
  return <View style={{gap:8,paddingVertical:12}}>
    {fare.loading?<ActivityIndicator color={colors.primary}/>:null}
    {fare.quote?<><Text style={{color:colors.foreground,fontWeight:'700'}}>
      Cotización fija: {new Intl.NumberFormat('es-PR',{style:'currency',currency:'USD'}).format(fare.quote.totalCents/100)} USD
    </Text><Text style={{color:colors.mutedForeground,fontSize:12}}>
      Base {String(fare.quote.breakdown.baseCents)} ¢.
      {'\n'}Distancia: {fraction(fare.quote.breakdown.distanceCents)} ¢; tiempo: {fraction(fare.quote.breakdown.timeCents)} ¢ (componentes aproximados).
      Mínimo {String(fare.quote.breakdown.minimumCents)} ¢; redondeo final al centavo.
      {fare.quote.breakdown.minimumApplied?' Se aplicó el mínimo.':''}
      {'\n'}{(fare.quote.distanceMm/1_000_000).toFixed(2)} km · {(fare.quote.durationMs/60_000).toFixed(1)} min estimados.
      {'\n'}Vence: {new Date(fare.quote.expiresAt).toLocaleTimeString('es-PR',{timeZone:'America/Puerto_Rico'})} (Puerto Rico). Versión: {fare.quote.ruleVersionId}.
    </Text></>:null}
    <Text accessibilityLiveRegion="polite" style={{color:colors.mutedForeground,fontSize:12}}>{fare.message}</Text>
    {fare.required&&!fare.loading?<AppButton label="Solicitar nueva cotización" variant="secondary" onPress={fare.retry}/>:null}
  </View>;
}
