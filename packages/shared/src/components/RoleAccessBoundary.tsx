import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../hooks/useColors';
import { isHomeAuthorized } from '../lib/roleRouting';
import type { UserRole } from '../lib/roles';
import { AppButton } from './AppButton';
import { RoleMismatchScreen } from './RoleMismatchScreen';

// Protect the whole route group, including direct links to history/profile.
export function RoleAccessBoundary({ expectedRole, requireOnboarding = true, children }: {
  expectedRole: UserRole;
  requireOnboarding?: boolean;
  children: ReactNode;
}) {
  const auth = useAuth();
  const colors = useColors();
  if (auth.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.foreground }}>Cargando tu perfil…</Text>
      </View>
    );
  }
  if (!auth.session || auth.authIssue === 'session_expired') {
    return <Redirect href="/(auth)/sign-in" />;
  }
  if (!auth.profile || auth.authIssue === 'profile_unavailable'
    || auth.profile.id !== auth.session.user.id) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>No pudimos verificar el perfil de esta sesión.</Text>
        <AppButton label="Volver a verificar" onPress={() => void auth.refreshProfile()} />
        <AppButton label="Cerrar sesión" variant="secondary" onPress={() => void auth.signOut()} />
      </View>
    );
  }
  if (!isHomeAuthorized({
    isLoading: auth.isLoading,
    userId: auth.session.user.id,
    profileId: auth.profile.id,
    profileRole: auth.profile.role,
    expectedRole,
  })) {
    return <RoleMismatchScreen expectedRole={expectedRole} />;
  }
  if (requireOnboarding && !auth.profile.onboarding_completed) {
    return <Redirect href="/onboarding" />;
  }
  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 18 },
});
