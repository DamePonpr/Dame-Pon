import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { BrandMark } from '@/components/BrandMark';
import { RoleCard } from '@/components/RoleCard';
import { useAuth, type UserRole } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { getMunicipalities } from '@/lib/rideService';
import type { Municipality } from '@/lib/municipality';

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [role, setRole] = useState<UserRole>('passenger');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseMunicipality, setBaseMunicipality] = useState('');
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [showMunicipalities, setShowMunicipalities] = useState(false);
  const [municipalitiesLoading, setMunicipalitiesLoading] = useState(false);
  const [municipalityError, setMunicipalityError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (role !== 'driver' || municipalities.length) return;
    setMunicipalitiesLoading(true);
    void getMunicipalities().then((result) => {
      setMunicipalitiesLoading(false);
      if (result.error) {
        setMunicipalityError(result.error);
        return;
      }
      setMunicipalities(result.data ?? []);
    });
  }, [municipalities.length, role]);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6 || role === 'driver' && !baseMunicipality) {
      setError('Agrega tu nombre, un correo válido y una contraseña de 6 caracteres o más.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signUp({ fullName, phone, email, password, role, baseMunicipality });
    setLoading(false);
    if (result.error) {
      console.error('[Dame Pon] Error real al crear la cuenta:', result.error);
      const normalizedError = result.error.toLowerCase();
      if (
        normalizedError === 'phone_already_registered'
        || normalizedError.includes('phone')
        && (normalizedError.includes('already') || normalizedError.includes('duplicate') || normalizedError.includes('unique'))
      ) {
        setError('Este teléfono ya está registrado. Usa otro número o inicia sesión con la cuenta existente.');
      } else if (normalizedError.includes('already registered') || normalizedError.includes('already been registered')) {
        setError('Este correo ya tiene una cuenta. Intenta iniciar sesión.');
      } else if (normalizedError.includes('password')) {
        setError('La contraseña no cumple los requisitos de Supabase.');
      } else {
        setError('No pudimos crear tu cuenta. Verifica tus datos e inténtalo de nuevo.');
      }
      return;
    }
    if (result.needsEmailConfirmation) {
      Alert.alert(
        'Cuenta creada',
        'Revisa tu correo para confirmar tu cuenta. Después podrás iniciar sesión como conductor.',
        [{ text: 'Ir a iniciar sesión', onPress: () => router.replace('/auth/login') }],
      );
      return;
    }
    router.replace('/');
  };

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[styles.content, { backgroundColor: colors.background, paddingTop: insets.top + 22, paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.top}>
        <Link href="/auth/login" style={[styles.back, { color: colors.primary }]}>‹  Volver</Link>
        <BrandMark compact />
      </View>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground }]}>Crea tu cuenta</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Primero cuéntanos cómo usarás Dame Pon.</Text>
      </View>
      <View style={styles.roles}>
        <RoleCard role="passenger" selected={role === 'passenger'} onPress={() => setRole('passenger')} />
        <RoleCard role="driver" selected={role === 'driver'} onPress={() => setRole('driver')} />
      </View>
      <View style={styles.form}>
        <AppInput label="Nombre completo" value={fullName} onChangeText={setFullName} placeholder="Ej. Ana Rivera" autoCapitalize="words" testID="register-name" />
        <AppInput label="Teléfono (opcional)" value={phone} onChangeText={setPhone} placeholder="+1 787 000 0000" keyboardType="phone-pad" testID="register-phone" />
        <AppInput label="Correo electrónico" value={email} onChangeText={setEmail} placeholder="tu@correo.com" autoCapitalize="none" keyboardType="email-address" testID="register-email" />
        <AppInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" secureTextEntry testID="register-password" />
        {role === 'driver' ? (
          <View style={styles.municipalityField}>
            <Text style={[styles.municipalityLabel, { color: colors.foreground }]}>Municipio base</Text>
            <Pressable
              testID="register-base-municipality"
              onPress={() => setShowMunicipalities(true)}
              style={({ pressed }) => [styles.municipalityButton, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.municipalityValue, { color: baseMunicipality ? colors.foreground : colors.mutedForeground }]}>
                {baseMunicipality || 'Escoge tu pueblo'}
              </Text>
              <Text style={[styles.municipalityChevron, { color: colors.primary }]}>⌄</Text>
            </Pressable>
            {municipalityError ? <Text style={[styles.error, { color: colors.destructive }]}>{municipalityError}</Text> : null}
          </View>
        ) : null}
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <AppButton label="Crear cuenta" onPress={handleRegister} loading={loading} testID="register-submit" />
      </View>
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>¿Ya tienes una cuenta?</Text>
        <Link href="/auth/login" style={[styles.link, { color: colors.primary }]}>Inicia sesión</Link>
      </View>
      <Modal transparent visible={showMunicipalities} animationType="slide" onRequestClose={() => setShowMunicipalities(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMunicipalities(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Tu pueblo base</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Las solicitudes de este municipio aparecerán primero.</Text>
            {municipalitiesLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <ScrollView style={styles.municipalityList} contentContainerStyle={styles.municipalityListContent}>
                {municipalities.map((municipality) => (
                  <Pressable
                    key={municipality.id}
                    testID={`register-municipality-${municipality.id}`}
                    onPress={() => {
                      setBaseMunicipality(municipality.nombre);
                      setShowMunicipalities(false);
                    }}
                    style={[styles.municipalityOption, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.municipalityValue, { color: colors.foreground }]}>{municipality.nombre}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 20 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  heading: { gap: 7, paddingTop: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  roles: { gap: 10 },
  form: { gap: 14 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  municipalityField: { gap: 7 },
  municipalityLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  municipalityButton: { minHeight: 51, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  municipalityValue: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  municipalityChevron: { fontSize: 22, lineHeight: 22 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,28,38,0.5)' },
  modalCard: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, gap: 14, maxHeight: '88%' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  municipalityList: { minHeight: 120 },
  municipalityListContent: { gap: 8, paddingBottom: 4 },
  municipalityOption: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 1, paddingBottom: 4 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
