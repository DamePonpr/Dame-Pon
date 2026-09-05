import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth, type UserRole } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { AppButton } from '@/components/AppButton';
import { BrandMark } from '@/components/BrandMark';

export function RoleHome({ role }: { role: UserRole }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const isDriver = role === 'driver';
  const [isAvailable, setIsAvailable] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [destination, setDestination] = useState('');
  const [savedDestination, setSavedDestination] = useState('');

  const firstName = profile?.full_name?.trim().split(' ')[0] || (isDriver ? 'conductor' : 'viajero');

  const confirmDestination = () => {
    if (!destination.trim()) return;
    setSavedDestination(destination.trim());
    setDestination('');
    setShowDestination(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <BrandMark compact />
        <Pressable
          testID="logout-button"
          accessibilityLabel="Cerrar sesión"
          onPress={() => {
            void Haptics.selectionAsync();
            void signOut();
          }}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.secondary }, pressed && { opacity: 0.7 }]}
        >
          <Feather name="log-out" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.greeting}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>{isDriver ? 'PANEL DEL CONDUCTOR' : 'BUEN DÍA'}</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Hola, {firstName}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {isDriver ? 'Tu próxima oportunidad está a un toque.' : '¿A dónde te llevamos hoy?'}
          </Text>
        </View>

        {isDriver ? (
          <>
            <View style={[styles.availabilityCard, { backgroundColor: colors.primary }]}>
              <View style={styles.availabilityCopy}>
                <Text style={styles.inverseEyebrow}>ESTADO DE CONEXIÓN</Text>
                <Text style={styles.inverseTitle}>{isAvailable ? 'Estás disponible' : 'Estás desconectado'}</Text>
                <Text style={styles.inverseSubtitle}>
                  {isAvailable ? 'Podrás recibir solicitudes cercanas.' : 'Actívate cuando quieras comenzar.'}
                </Text>
              </View>
              <Pressable
                testID="availability-toggle"
                onPress={() => {
                  void Haptics.selectionAsync();
                  setIsAvailable((current) => !current);
                }}
                style={[styles.toggle, { backgroundColor: isAvailable ? '#B7E3C5' : 'rgba(255,255,255,0.16)' }]}
              >
                <View style={[styles.toggleThumb, { backgroundColor: isAvailable ? '#247A48' : '#FFFFFF', alignSelf: isAvailable ? 'flex-end' : 'flex-start' }]} />
              </Pressable>
            </View>
            <View style={styles.statsRow}>
              <Stat label="Viajes hoy" value="0" icon="navigation" />
              <Stat label="Calificación" value="—" icon="star" />
            </View>
            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.infoIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="shield" size={18} color={colors.primary} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={[styles.infoTitle, { color: colors.foreground }]}>Tu seguridad primero</Text>
                <Text style={[styles.infoText, { color: colors.mutedForeground }]}>Completa tu vehículo y documentos para empezar a aceptar viajes.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.mapCard, { backgroundColor: colors.primary }]}>
              <View style={styles.mapGrid}>
                <View style={[styles.mapLine, styles.mapLineOne]} />
                <View style={[styles.mapLine, styles.mapLineTwo]} />
                <View style={[styles.routeLine, { backgroundColor: '#FFFFFF' }]} />
                <View style={[styles.mapPin, styles.startPin, { backgroundColor: '#FFFFFF' }]}>
                  <View style={[styles.pinDot, { backgroundColor: colors.primary }]} />
                </View>
                <View style={[styles.mapPin, styles.endPin, { backgroundColor: '#B7E3C5' }]}>
                  <Feather name="map-pin" size={15} color="#247A48" />
                </View>
              </View>
              <View style={styles.mapOverlay}>
                <Text style={styles.mapLabel}>Dame Pon está cerca</Text>
                <Text style={styles.mapMeta}>Conductores disponibles en tu zona</Text>
              </View>
            </View>
            <Pressable
              testID="destination-button"
              onPress={() => setShowDestination(true)}
              style={({ pressed }) => [styles.destinationCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.82 }]}
            >
              <View style={[styles.searchIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="search" size={18} color={colors.primary} />
              </View>
              <View style={styles.destinationCopy}>
                <Text style={[styles.destinationLabel, { color: colors.mutedForeground }]}>¿A dónde vas?</Text>
                <Text style={[styles.destinationValue, { color: savedDestination ? colors.foreground : colors.mutedForeground }]}>
                  {savedDestination || 'Busca un destino'}
                </Text>
              </View>
              <Feather name="arrow-up-right" size={19} color={colors.primary} />
            </Pressable>
            <View style={[styles.reassurance, { backgroundColor: colors.secondary }]}>
              <Feather name="clock" size={17} color={colors.primary} />
              <Text style={[styles.reassuranceText, { color: colors.primary }]}>Viajes confiables, tarifas claras y apoyo cuando lo necesites.</Text>
            </View>
          </>
        )}
      </View>

      <Modal transparent visible={showDestination} animationType="slide" onRequestClose={() => setShowDestination(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDestination(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.background, paddingBottom: insets.bottom + 22 }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>¿A dónde vas?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Escribe tu destino para preparar tu solicitud.</Text>
            <View style={[styles.modalInputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="map-pin" size={18} color={colors.primary} />
              <TextInput
                autoFocus
                value={destination}
                onChangeText={setDestination}
                placeholder="Ej. Plaza Las Américas"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.modalInput, { color: colors.foreground }]}
              />
            </View>
            <AppButton label="Continuar" onPress={confirmDestination} disabled={!destination.trim()} testID="confirm-destination" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Feather.glyphMap }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={17} color={colors.primary} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 22, gap: 18 },
  greeting: { gap: 5, paddingTop: 8 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  availabilityCard: { borderRadius: 22, padding: 20, minHeight: 165, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  availabilityCopy: { flex: 1, gap: 7, paddingRight: 12 },
  inverseEyebrow: { color: 'rgba(255,255,255,0.63)', fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.2 },
  inverseTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.4 },
  inverseSubtitle: { color: 'rgba(255,255,255,0.76)', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  toggle: { width: 48, height: 28, borderRadius: 20, padding: 4 },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 17, padding: 15, gap: 7 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, gap: 4 },
  infoTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  infoText: { fontFamily: 'Inter_400Regular', fontSize: 11.5, lineHeight: 16 },
  mapCard: { height: 235, borderRadius: 22, overflow: 'hidden', position: 'relative' },
  mapGrid: { ...StyleSheet.absoluteFill, opacity: 0.85 },
  mapLine: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ rotate: '25deg' }] },
  mapLineOne: { width: '120%', top: 75, left: -15 },
  mapLineTwo: { width: '120%', top: 156, left: -10, transform: [{ rotate: '-18deg' }] },
  routeLine: { position: 'absolute', width: 3, height: 140, left: '47%', top: 46, transform: [{ rotate: '35deg' }], borderRadius: 3 },
  mapPin: { position: 'absolute', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, elevation: 3 },
  startPin: { top: 46, left: 68 },
  endPin: { bottom: 45, right: 58 },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  mapOverlay: { position: 'absolute', left: 18, bottom: 18, gap: 4 },
  mapLabel: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  mapMeta: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 11 },
  destinationCard: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchIcon: { width: 41, height: 41, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  destinationCopy: { flex: 1, gap: 4 },
  destinationLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  destinationValue: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  reassurance: { borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reassuranceText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,28,38,0.5)' },
  modalCard: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, gap: 14 },
  modalHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: '#D6E1E6', alignSelf: 'center', marginBottom: 6 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  modalInputRow: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
});
