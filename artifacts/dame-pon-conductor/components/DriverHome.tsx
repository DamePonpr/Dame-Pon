import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { AppButton } from '@workspace/dame-pon-shared/components/AppButton';
import { LiveRideMap } from '@workspace/dame-pon-shared/components/LiveRideMap';
import { RideLayout } from '@workspace/dame-pon-shared/components/RideLayout';
import { TripCompletionScreen } from '@workspace/dame-pon-shared/components/TripCompletionScreen';
import { useColors } from '@workspace/dame-pon-shared/hooks/useColors';
import { useDriverHome } from '@/hooks/useDriverHome';
import type { Profile } from '@workspace/dame-pon-shared/context/AuthContext';
import type { MunicipalityDecision } from '@workspace/dame-pon-shared/lib/municipality';
import { MunicipalityPicker } from '@workspace/dame-pon-shared/components/MunicipalityPicker';
import { DriverDocumentsPanel } from './DriverDocumentsPanel';
import { useDriverDocuments } from '../hooks/useDriverDocuments';

export function DriverHome({ profile, userId, onSignOut, onSessionExpired }: {
  profile: Profile;
  userId: string;
  onSignOut: () => void;
  onSessionExpired: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const home = useDriverHome(userId, onSessionExpired);
  const documents = useDriverDocuments(userId);
  const [passengerPin, setPassengerPin] = useState('');
  const [pinPromptVisible, setPinPromptVisible] = useState(false);
  const activeMunicipality = home.setup?.driver?.municipio_activo ?? home.setup?.driver?.municipio_base;

  if (home.completion) {
    return <TripCompletionScreen trip={home.completion} isDriver onContinue={home.clearCompletion} />;
  }

  return (
    <RideLayout
      title="Dame Pon"
      snapPoints={['45%', '90%']}
      map={<LiveRideMap passengerLocation={null} driverLocation={home.driverLocation} pickupLocation={null} />}
    >
      <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 72 + 28 }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.onlineCopy}>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>PANEL DEL CONDUCTOR</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Hola, {profile.full_name?.split(' ')[0] ?? 'conductor'}</Text>
          </View>
          <Pressable accessibilityLabel="Cerrar sesión" onPress={onSignOut} style={[styles.iconButton, { backgroundColor: colors.secondary }]}>
            <Feather name="log-out" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <DriverDocumentsPanel userId={userId} />
        <View style={[styles.onlineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.onlineCopy}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>En línea</Text>
            <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>
              {!documents.isFullyApproved
                ? 'La disponibilidad se habilita cuando todos tus documentos estén aprobados.'
                : home.isOnline
                  ? 'Puedes recibir solicitudes de tu municipio activo.'
                  : 'Activa tu disponibilidad para recibir solicitudes.'}
            </Text>
          </View>
          <View style={styles.switchWrap}>
            <Switch value={home.isOnline} onValueChange={(value) => void home.toggleOnline(value)} disabled={home.actionLoading || !documents.isFullyApproved} trackColor={{ false: colors.border, true: colors.star }} thumbColor={home.isOnline ? colors.primaryForeground : colors.mutedForeground} />
          </View>
        </View>
        {home.error ? <Text style={[styles.error, { color: colors.destructive }]}>{home.error}</Text> : null}

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pueblo activo</Text>
        <View style={styles.municipalityControls}>
          <View style={styles.municipalityRow}>
            {home.orderedMunicipalities.slice(0, 4).map((municipality) => {
              const selected = municipality.nombre === activeMunicipality;
              return (
                <Pressable
                  key={municipality.id}
                  onPress={() => void home.changeActiveMunicipality(municipality.nombre)}
                  style={({ pressed }) => [
                    styles.municipalityChip,
                    { backgroundColor: selected ? colors.primary : colors.secondary, borderColor: selected ? colors.primary : colors.border },
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontFamily: 'Jakarta-SemiBold', fontSize: 12 }}>{municipality.nombre}</Text>
                </Pressable>
              );
            })}
          </View>
          <MunicipalityPicker
            compact
            placeholder="Buscar municipio"
            value={activeMunicipality}
            municipalities={home.municipalities}
            onSelect={(municipality) => void home.changeActiveMunicipality(municipality.nombre)}
          />
        </View>

        {!home.setup?.vehicle ? <VehicleForm home={home} colors={colors} /> : null}
        {home.activeTrip ? (
          <View style={[styles.activeTrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tripLabel, { color: colors.mutedForeground }]}>VIAJE ACTIVO</Text>
            <Text style={[styles.passengerName, { color: colors.foreground }]}>{home.participantDetails?.passenger_name ?? 'Pasajero'}</Text>
            <Text style={[styles.routeText, { color: colors.mutedForeground }]} numberOfLines={2}>
              {home.activeTrip.pickup_address || home.activeTrip.municipio_origen || 'Origen'} → {home.activeTrip.dropoff_address || home.activeTrip.municipio_destino || 'Destino'}
            </Text>
            <View style={styles.tripActions}>
              <AppButton
                label={home.activeTrip.status === 'accepted' || home.activeTrip.status === 'arrived' ? 'Iniciar viaje' : 'Completar viaje'}
                onPress={() => {
                  if (home.activeTrip?.status === 'accepted' || home.activeTrip?.status === 'arrived') {
                    setPinPromptVisible(true);
                  } else {
                    void home.updateStatus('completed');
                  }
                }}
                loading={home.actionLoading}
                style={styles.tripAction}
              />
              <AppButton label="Cancelar" variant="secondary" onPress={() => void home.cancel()} loading={home.actionLoading} style={styles.tripAction} />
              <AppButton label="Chat" variant="secondary" onPress={() => router.push('/(root)/(tabs)/chat')} style={styles.tripAction} />
            </View>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Solicitudes disponibles</Text>
            {home.loading ? <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>Cargando solicitudes…</Text> : null}
            {!home.loading && home.trips.length === 0 ? <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>Las nuevas solicitudes aparecerán aquí.</Text> : null}
            {home.trips.slice(0, 5).map((trip) => (
              <View key={trip.id} style={[styles.requestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{trip.municipio_origen ?? 'Puerto Rico'}</Text>
                  <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>{trip.pickup_address} → {trip.dropoff_address}</Text>
                </View>
                <AppButton label="Aceptar" onPress={() => void home.accept(trip)} loading={home.actionLoading} />
              </View>
            ))}
          </>
        )}
        {home.decision ? <MunicipalityDecisionCard home={home} colors={colors} /> : null}
      </View>
      <Modal visible={pinPromptVisible} transparent animationType="fade" onRequestClose={() => setPinPromptVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.pinModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Confirma el PIN del pasajero</Text>
            <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>Pídele el PIN de cuatro dígitos antes de iniciar el viaje.</Text>
            <TextInput
              value={passengerPin}
              onChangeText={(value) => setPassengerPin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="0000"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.pinInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <View style={styles.modalActions}>
              <AppButton label="Volver" variant="secondary" onPress={() => setPinPromptVisible(false)} style={styles.tripAction} />
              <AppButton
                label="Iniciar viaje"
                onPress={() => {
                  void home.updateStatus('in_progress', passengerPin).then((success) => {
                    if (success) {
                      setPassengerPin('');
                      setPinPromptVisible(false);
                    }
                  });
                }}
                loading={home.actionLoading}
                style={styles.tripAction}
              />
            </View>
          </View>
        </View>
      </Modal>
    </RideLayout>
  );
}

function VehicleForm({ home, colors }: { home: ReturnType<typeof useDriverHome>; colors: ReturnType<typeof useColors> }) {
  const fields: Array<['make' | 'model' | 'year' | 'color' | 'licensePlate', string]> = [
    ['make', 'Marca'], ['model', 'Modelo'], ['year', 'Año'], ['color', 'Color'], ['licensePlate', 'Matrícula'],
  ];
  return (
    <View style={[styles.vehicleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Registra tu vehículo</Text>
      <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>Necesitamos estos datos antes de activar tu perfil.</Text>
      {fields.map(([key, label]) => (
        <TextInput
          key={key}
          value={home.vehicle[key]}
          placeholder={label}
          placeholderTextColor={colors.mutedForeground}
          onChangeText={(value) => home.setVehicle({ ...home.vehicle, [key]: value })}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
        />
      ))}
      <AppButton label="Guardar vehículo" onPress={() => void home.saveVehicle()} loading={home.actionLoading} />
    </View>
  );
}

function MunicipalityDecisionCard({ home, colors }: { home: ReturnType<typeof useDriverHome>; colors: ReturnType<typeof useColors> }) {
  if (!home.decision) return null;
  return (
    <View style={[styles.decisionCard, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Terminaste fuera de tu municipio</Text>
      <Text style={[styles.cardCaption, { color: colors.mutedForeground }]}>¿Quieres quedarte en {home.decision.destination} o regresar a {home.decision.base}?</Text>
      <View style={styles.decisionRow}>
        <AppButton label={`Quedarme en ${home.decision.destination}`} onPress={() => void home.chooseMunicipality('stay')} loading={home.actionLoading} />
        <AppButton label={`Regresar a ${home.decision.base}`} variant="secondary" onPress={() => void home.chooseMunicipality('return')} loading={home.actionLoading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContent: { gap: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.2 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 25, marginTop: 5 },
  onlineCard: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center' },
  onlineCopy: { flex: 1, minWidth: 0 },
  switchWrap: { marginLeft: 12 },
  cardTitle: { fontFamily: 'Jakarta-SemiBold', fontSize: 15 },
  cardCaption: { fontFamily: 'Jakarta', fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { fontFamily: 'Jakarta-Medium', fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontFamily: 'Jakarta-Bold', fontSize: 17, marginTop: 4 },
  municipalityControls: { gap: 9 },
  municipalityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  municipalityChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9 },
  vehicleCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, fontFamily: 'Jakarta', fontSize: 13 },
  activeTrip: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 9 },
  tripLabel: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.2 },
  passengerName: { fontFamily: 'Jakarta-Bold', fontSize: 19 },
  routeText: { fontFamily: 'Jakarta', fontSize: 13, lineHeight: 19 },
  tripActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
  tripAction: { flex: 1, minHeight: 52, paddingHorizontal: 10 },
  requestCard: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  decisionCard: { borderRadius: 18, padding: 14, gap: 8 },
  decisionRow: { gap: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 22 },
  pinModal: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 10 },
  pinInput: { borderWidth: 1, borderRadius: 12, minHeight: 52, paddingHorizontal: 14, textAlign: 'center', fontFamily: 'Jakarta-Bold', fontSize: 24, letterSpacing: 5 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
});