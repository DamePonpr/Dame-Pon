import { Feather } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../hooks/useColors';
import type { UserRole } from '../lib/roles';

const appLinks: Record<UserRole, { scheme: string; label: string }> = {
  pasajero: { scheme: 'dame-pon-pasajero://', label: 'Dame Pon Pasajero' },
  conductor: { scheme: 'dame-pon-conductor://', label: 'Dame Pon Conductor' },
};

export function RoleMismatchScreen({ expectedRole }: { expectedRole: UserRole }) {
  const colors = useColors();
  const otherRole: UserRole = expectedRole === 'pasajero' ? 'conductor' : 'pasajero';
  const target = appLinks[otherRole];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
        <Feather name="smartphone" size={24} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Esta cuenta es de {otherRole === 'conductor' ? 'conductor' : 'pasajero'}
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Abre {target.label} para continuar. Esta app solo permite el flujo de {expectedRole === 'pasajero' ? 'pasajeros' : 'conductores'}.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void Linking.openURL(target.scheme)}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && { opacity: 0.82 }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Abrir {target.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 23, textAlign: 'center' },
  body: { fontFamily: 'Jakarta', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 330 },
  button: { minHeight: 48, borderRadius: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontFamily: 'Jakarta-SemiBold', fontSize: 14 },
});