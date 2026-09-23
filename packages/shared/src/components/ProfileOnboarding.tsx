import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from './AppButton';
import { BrandLogo } from './BrandLogo';
import { InlineNotice } from './InlineNotice';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../hooks/useColors';
import { completeProfileOnboarding, type PaymentMethod } from '../lib/onboarding';
import type { BrandLogoRole } from './BrandLogo';

export function ProfileOnboarding({ role }: { role: BrandLogoRole }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(profile?.default_payment_method ?? 'cash');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  async function choosePhoto() {
    try {
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
    } catch (error) {
      console.error('[Dame Pon] elegir foto de perfil falló:', error);
      setNotice({ title: 'No pudimos elegir la foto', message: error instanceof Error ? error.message : 'Inténtalo de nuevo.' });
    }
  }

  async function finish() {
    if (!user) return;
    if (!fullName.trim() || !phone.trim()) {
      setNotice({ title: 'Completa tus datos', message: 'El nombre completo y el teléfono son obligatorios.' });
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const result = await completeProfileOnboarding(
        user.id,
        fullName,
        phone,
        paymentMethod,
        avatarUri,
        'image/jpeg',
      );
      if (result.error) {
        console.error('[Dame Pon] completar onboarding falló:', result.error);
        setNotice({ title: 'No pudimos guardar tu cuenta', message: result.error });
        return;
      }

      const refreshed = await refreshProfile();
      if (refreshed.error) {
        setNotice({ title: 'No pudimos actualizar tu cuenta', message: refreshed.error });
        return;
      }
      router.replace('/(root)/(tabs)/home' as never);
    } catch (error) {
      console.error('[Dame Pon] completar onboarding lanzó una excepción:', error);
      setNotice({ title: 'No pudimos guardar tu cuenta', message: error instanceof Error ? error.message : 'Inténtalo de nuevo.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <BrandLogo role={role} style={styles.logo} />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>UN ÚLTIMO PASO</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Prepara tu cuenta</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          Completa los datos que faltan. La foto es opcional y puedes escoger cómo pagar tus viajes.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Datos de contacto</Text>
        <TextInput
          autoCapitalize="words"
          onChangeText={setFullName}
          placeholder="Nombre completo"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          value={fullName}
        />
        <TextInput
          keyboardType="phone-pad"
          onChangeText={setPhone}
          placeholder="787-000-0000"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
          value={phone}
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Foto de perfil</Text>
        <Text style={[styles.cardCopy, { color: colors.mutedForeground }]}>Opcional. Ayuda a que te reconozcan al coordinar un viaje.</Text>
        <View style={styles.photoRow}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.avatarPlaceholder, { color: colors.primary }]}>+</Text>
            </View>
          )}
          <AppButton label={avatarUri ? 'Cambiar foto' : 'Añadir foto'} variant="secondary" onPress={() => void choosePhoto()} style={styles.smallButton} loading={loading} />
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
                disabled={loading}
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

      {notice ? <InlineNotice title={notice.title} message={notice.message} /> : null}
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
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontFamily: 'Jakarta-Bold', fontSize: 17 },
  cardCopy: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18 },
  input: { borderRadius: 12, borderWidth: 1, fontFamily: 'Jakarta', fontSize: 14, minHeight: 48, paddingHorizontal: 13 },
  photoRow: { alignItems: 'center', flexDirection: 'row', gap: 14, marginTop: 4 },
  avatar: { alignItems: 'center', borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  avatarPlaceholder: { fontFamily: 'Jakarta-Bold', fontSize: 34 },
  smallButton: { flex: 1, minHeight: 48 },
  options: { gap: 9, marginTop: 4 },
  option: { borderRadius: 14, borderWidth: 1, padding: 13 },
  optionTitle: { fontFamily: 'Jakarta-SemiBold', fontSize: 14 },
  optionCaption: { fontFamily: 'Jakarta', fontSize: 11, marginTop: 3 },
  footer: { fontFamily: 'Jakarta', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});