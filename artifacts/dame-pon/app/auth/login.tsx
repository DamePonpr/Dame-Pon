import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Completa tu correo y contraseña para continuar.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError('No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.');
      return;
    }
    router.replace('/');
  };

  return (
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[styles.content, { backgroundColor: colors.background, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <BrandMark />
        <View style={styles.welcome}>
          <Text style={[styles.title, { color: colors.foreground }]}>Bienvenido de vuelta</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Tu próximo viaje empieza aquí.</Text>
        </View>
      </View>

      <View style={styles.form}>
        <AppInput
          label="Correo electrónico"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="tu@correo.com"
          testID="login-email"
        />
        <AppInput
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          testID="login-password"
        />
        {error ? <Text style={[styles.formError, { color: colors.destructive }]}>{error}</Text> : null}
        <AppButton label="Iniciar sesión" onPress={handleLogin} loading={loading} testID="login-submit" />
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>Al continuar aceptas los términos y condiciones de Dame Pon.</Text>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>¿Aún no tienes una cuenta?</Text>
        <Link href="/auth/register" style={[styles.link, { color: colors.primary }]}>Crear cuenta</Link>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'space-between', gap: 38 },
  header: { gap: 62 },
  welcome: { gap: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21 },
  form: { gap: 16 },
  formError: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  helper: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, paddingHorizontal: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, paddingTop: 4 },
  footerText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  link: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
