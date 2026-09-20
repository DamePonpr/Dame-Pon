import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import type { Trip } from '../lib/rideService';

interface TripCompletionScreenProps {
  trip: Trip;
  isDriver: boolean;
  onContinue: () => void;
}

export function TripCompletionScreen({ trip, isDriver, onContinue }: TripCompletionScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const municipality = trip.municipio_destino ?? trip.municipio_origen ?? 'tu municipio';
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 18 }]}>
      <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
        <Feather name="check" size={34} color={colors.star} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {isDriver ? 'Viaje completado. Gracias por Darle Pon.' : '¡Llegaste! Gracias por pedir Pon.'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {isDriver ? `Tu próximo destino puede ser ${municipality}.` : `Esperamos verte pronto en ${municipality}.`}
      </Text>
      <Pressable
        onPress={onContinue}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {isDriver ? `Un viaje más por ${municipality}` : `Otro Pon por ${municipality}`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  icon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 25, lineHeight: 32, textAlign: 'center' },
  subtitle: { fontFamily: 'Jakarta', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { width: '100%', minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 12 },
  buttonText: { fontFamily: 'Jakarta-SemiBold', fontSize: 15, textAlign: 'center' },
});