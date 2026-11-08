import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';
import { AppButton } from './AppButton';
import { formatRoadRoute, type RouteState } from '../lib/roadRouting';

export function RoadRouteCard({ state, retry }: {state: RouteState;retry:()=>void}) {
  const colors=useColors();
  return <View testID="road-route-status" accessibilityLiveRegion="polite" style={{gap:7,paddingVertical:10}}>
    {state.status==='loading' ? <ActivityIndicator color={colors.primary}/> : null}
    <Text style={{color:colors.foreground,fontWeight:'600'}}>
      {state.route ? formatRoadRoute(state.route) : state.message}
    </Text>
    <Text style={{color:colors.mutedForeground,fontSize:12}}>
      {state.route ? 'Tiempo del trayecto origen–destino, no tiempo de llegada del conductor. Sin tráfico en vivo; no es una cotización.' : ''}
      {' '}Navegación guiada y seguimiento en segundo plano no disponibles.
    </Text>
    {!['idle','loading','ready'].includes(state.status) ? <AppButton label="Reintentar ruta" variant="secondary" onPress={retry}/> : null}
    <Text accessibilityRole="link" onPress={()=>void Linking.openURL('https://routing.openstreetmap.de/about.html').catch(()=>{})}
      style={{color:colors.primary,fontSize:11}}>OSRM · FOSSGIS · © OpenStreetMap</Text>
    <Text accessibilityRole="link" onPress={()=>void Linking.openURL('https://www.openstreetmap.org/fixthemap').catch(()=>{})}
      style={{color:colors.primary,fontSize:11}}>Corregir el mapa</Text>
  </View>;
}
