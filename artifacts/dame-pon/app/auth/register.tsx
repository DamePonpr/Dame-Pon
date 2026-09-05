import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { BrandMark } from '@/components/BrandMark';
import { RoleCard } from '@/components/RoleCard';
import { useAuth, type UserRole } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [role, setRole] = useState<UserRole>('passenger');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError('Agrega tu nombre, un correo válido y una contraseña de 6 caracteres o más.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signUp({ fullName, phone, email, password, role });
    setLoading(false);
    if (result.error) {
      setError('No pudimos crear tu cuenta. Verifica tus datos e inténtalo de nuevo.');
      return;
    }
    if (result.needsEmailConfirmation) {
      setError('Cuenta creada. Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
      router.replace('/auth/login');
      return;
    }
    router.replace('/');
  };

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 28 }]}
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
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <AppButton label="Crear cuenta" onPress={handleRegister} loading={loading} testID="register-submit" />
      </View>
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>¿Ya tienes una cuenta?</Text>
        <Link href="/auth/login" style={[styles.link, { color: colors.primary }]}>Inicia sesión</Link>
      </View>
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
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 1, paddingBottom: 4 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
