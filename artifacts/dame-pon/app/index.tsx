import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { routeForRole } from '@/lib/roleRouting';

export default function IndexScreen() {
  const colors = useColors();
  const { session, profile, isLoading, authIssue, clearAuthIssue, signOut } = useAuth();

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (authIssue === 'session_expired') {
    return (
      <View style={[styles.expired, { backgroundColor: colors.background }]}>
        <View style={[styles.expiredIcon, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.expiredIconText, { color: colors.primary }]}>!</Text>
        </View>
        <Text style={[styles.expiredTitle, { color: colors.foreground }]}>Tu sesión expiró</Text>
        <Text style={[styles.expiredText, { color: colors.mutedForeground }]}>
          Vuelve a iniciar sesión para continuar moviéndote con Dame Pon.
        </Text>
        <Pressable
          onPress={() => {
            clearAuthIssue();
            router.replace('/auth/login');
          }}
          style={({ pressed }) => [styles.expiredButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.82 }]}
        >
          <Text style={styles.expiredButtonText}>Iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) return <Redirect href="/auth/login" />;
  if (!profile) {
    if (authIssue === 'profile_unavailable') {
      return (
        <View style={[styles.expired, { backgroundColor: colors.background }]}>
          <View style={[styles.expiredIcon, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.expiredIconText, { color: colors.primary }]}>!</Text>
          </View>
          <Text style={[styles.expiredTitle, { color: colors.foreground }]}>No pudimos cargar tu perfil</Text>
          <Text style={[styles.expiredText, { color: colors.mutedForeground }]}>
            No mostraremos un panel hasta confirmar si tu cuenta es pasajero o conductor.
          </Text>
          <Pressable
            onPress={() => {
              void signOut();
              router.replace('/auth/login');
            }}
            style={({ pressed }) => [styles.expiredButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.82 }]}
          >
            <Text style={styles.expiredButtonText}>Volver a iniciar sesión</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const route = routeForRole(profile.role);
  return route ? <Redirect href={route} /> : <Redirect href="/auth/login" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  expired: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 12 },
  expiredIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  expiredIconText: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  expiredTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, textAlign: 'center', letterSpacing: -0.6 },
  expiredText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 310 },
  expiredButton: { minHeight: 52, borderRadius: 16, paddingHorizontal: 25, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  expiredButtonText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
