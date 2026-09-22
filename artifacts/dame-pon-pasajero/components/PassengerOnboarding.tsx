import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@workspace/dame-pon-shared/components/AppButton';
import { BrandLogo } from '@workspace/dame-pon-shared/components/BrandLogo';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import { completePassengerOnboarding, type PaymentMethod } from '@workspace/dame-pon-shared/lib/onboarding';

export function PassengerOnboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permiso necesario',
        'Puedes permitir el acceso a tus fotos desde Ajustes o continuar sin foto.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.78,
    });
    if (!result.canceled && result.assets[0]?.uri) setAvatarUri(result.assets[0].uri);
  }

  async function finish() {
    if (!user) return;
    setLoading(true);
    setError('');
    const result = await completePassengerOnboarding(
      user.id,
      paymentMethod,
      avatarUri,
      'image/jpeg',
    );
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace('/(root)/(tabs)/home');
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <BrandLogo role="pasajero" style={styles.logo} />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>UN ÚLTIMO PASO</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Prepara tu cuenta</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Puedes añadir una foto y escoger cómo pagar tus viajes. Todo es opcional; Efectivo queda seleccionado por defecto.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Foto de perfil</Text>
        <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Ayuda a que te reconozcan al coordinar un viaje.</Text>
        <View style={styles.photoRow}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.avatarPlaceholder, { color: colors.primary }]}>+</Text>
            </View>
          )}
          <AppButton label={avatarUri ? 'Cambiar foto' : 'Añadir foto'} variant="secondary" onPress={() => void choosePhoto()} style={styles.smallButton} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Método de pago inicial</Text>
        <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Podrás actualizarlo más adelante.</Text>
        <View style={styles.options}>
          {([
            ['cash', 'Efectivo', 'Paga al finalizar el viaje.'],
            ['card', 'Tarjeta', 'Añádela cuando estés listo.'],
          ] as const).map(([value, label, caption]) => {
            const selected = paymentMethod === value;
            return (
              <Pressable
                key={value}
                onPress={() => setPaymentMethod(value)}
                style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.background }]}
              >
                <Text style={[styles.optionTitle, { color: colors.foreground }]}>{label}</Text>
                <Text style={[styles.optionCaption, { color: colors.mutedForeground }]}>{caption}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <AppButton label="Continuar a Dame Pon" onPress={() => void finish()} loading={loading} />
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>Puedes completar la foto y la tarjeta después desde tu perfil.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 20, gap: 14 },
  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 8 },
  logo: { width: 92, height: 92, marginBottom: 18 },
  eyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 28, marginTop: 8, textAlign: 'center' },
  copy: { fontFamily: 'Jakarta', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 350, textAlign: 'center' },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  cardTitle: { fontFamily: 'Jakarta-Bold', fontSize: 17 },
  cardCopy: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18 },
  photoRow: { alignItems: 'center', flexDirection: 'row', gap: 14, marginTop: 10 },
  avatar: { alignItems: 'center', borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  avatarPlaceholder: { fontFamily: 'Jakarta-Bold', fontSize: 34 },
  smallButton: { flex: 1, minHeight: 48 },
  options: { gap: 9, marginTop: 10 },
  option: { borderRadius: 14, borderWidth: 1, padding: 13 },
  optionTitle: { fontFamily: 'Jakarta-SemiBold', fontSize: 14 },
  optionCaption: { fontFamily: 'Jakarta', fontSize: 11, marginTop: 3 },
  error: { fontFamily: 'Jakarta-Medium', fontSize: 13, lineHeight: 19 },
  footer: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});