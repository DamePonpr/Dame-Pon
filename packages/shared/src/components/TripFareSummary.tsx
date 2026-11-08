import { Text } from 'react-native';
import { useColors } from '../hooks/useColors';
export function TripFareSummary({trip}:{trip:{fare_estimate?:number|null;fare_final?:number|null}}) {
  const colors=useColors();
  const amount=trip.fare_final??trip.fare_estimate;
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0) return null;
  return <Text style={{color:colors.foreground,fontSize:13,paddingVertical:8}}>
    Importe registrado: {new Intl.NumberFormat('es-PR',{style:'currency',currency:'USD'}).format(amount)} USD.
    {'\n'}No acredita un pago ni genera un cobro en la app.
  </Text>;
}
