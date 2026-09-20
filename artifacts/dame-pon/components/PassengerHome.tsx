import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/BrandMark';
import { AppButton } from '@/components/AppButton';
import GoogleTextInput from '@/components/GoogleTextInput';
import { LiveRideMap } from '@/components/LiveRideMap';
import { RideCard } from '@/components/RideCard';
import { TripCompletionScreen } from '@/components/TripCompletionScreen';
import { icons } from '@/constants';
import { useColors } from '@/hooks/useColors';
import { usePassengerHome } from '@/hooks/usePassengerHome';
import type { Profile } from '@/context/AuthContext';
import type { LocationValue } from '@/types/type';

export function PassengerHome({ profile, userId, onSignOut, onSessionExpired }: {
  profile: Profile;
  userId: string;
  onSignOut: () => void;
  onSessionExpired: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const home = usePassengerHome(userId, onSessionExpired);
  const [destination, setDestination] = useState<LocationValue | null>(null);
  const firstName = profile.full_name?.trim().split(' ')[0] || 'de nuevo';

  if (home.completion) {
    return <TripCompletionScreen trip={home.completion.trip} isDriver={false} onContinue={home.clearCompletion} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 100 }}
      >
        <View style={styles.header}>
          <BrandMark compact />
          <Pressable accessibilityLabel="Cerrar sesión" onPress={onSignOut} style={[styles.iconButton, { backgroundColor: colors.secondary }]}>
            <Feather name="log-out" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <View style={styles.greeting}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>BUEN DÍA</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Hola, {firstName}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>¿A dónde vas hoy?</Text>
        </View>

        <GoogleTextInput
          icon={icons.search}
          initialLocation={destination?.address}
          handlePress={(value) => {
            setDestination(value);
            void home.selectDestination(value);
          }}
          textInputBackgroundColor={colors.card}
        />
        {home.actionLoading ? <Text style={[styles.helper, { color: colors.mutedForeground }]}>Solicitando tu Pon…</Text> : null}
        {home.error ? <Text style={[styles.error, { color: colors.destructive }]}>{home.error}</Text> : null}

        {home.activeTrip ? (
          <View style={[styles.activeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.activeEyebrow, { color: colors.mutedForeground }]}>PON ACTIVO</Text>
            <Text style={[styles.activeTitle, { color: colors.foreground }]}>{tripStatus(home.activeTrip.status)}</Text>
            <Text style={[styles.activeDestination, { color: colors.mutedForeground }]}>{home.activeTrip.dropoff_address}</Text>
            {home.activeTrip.status === 'completado' ? null : (
              <AppButton label="Cancelar Pon" variant="secondary" onPress={home.cancel} loading={home.actionLoading} />
            )}
          </View>
        ) : null}

        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tu ubicación</Text>
              <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
                {home.pickup?.address ?? 'Activa tu ubicación para comenzar'}
              </Text>
            </View>
            <Feather name="map-pin" size={19} color={colors.primary} />
          </View>
          <View style={styles.mapFrame}>
            <LiveRideMap
              passengerLocation={home.pickup}
              driverLocation={home.driverLocation}
              pickupLocation={null}
            />
          </View>
        </View>

        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Viajes recientes</Text>
          <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>{home.history.length} viajes</Text>
        </View>
        {home.loading ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Cargando tus viajes…</Text>
        ) : home.history.length ? (
          home.history.slice(0, 3).map((item) => <RideCard key={item.trip.id} item={item} />)
        ) : (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>Tus viajes recientes aparecerán aquí.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function tripStatus(status: string) {
  if (status === 'buscando_conductor') return 'Buscando conductor';
  if (status === 'aceptado') return 'Conductor en camino';
  if (status === 'en_curso') return 'Viaje en curso';
  return 'Viaje completado';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  greeting: { paddingHorizontal: 20, marginTop: 27, marginBottom: 18 },
  eyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: 'Jakarta-Bold', fontSize: 29, marginTop: 6 },
  subtitle: { fontFamily: 'Jakarta', fontSize: 15, marginTop: 5 },
  helper: { paddingHorizontal: 20, marginTop: 8, fontFamily: 'Jakarta', fontSize: 13 },
  error: { paddingHorizontal: 20, marginTop: 9, fontFamily: 'Jakarta-Medium', fontSize: 13, lineHeight: 19 },
  activeCard: { margin: 20, marginBottom: 4, borderRadius: 22, borderWidth: 1, padding: 18, gap: 9 },
  activeEyebrow: { fontFamily: 'Jakarta-SemiBold', fontSize: 10, letterSpacing: 1.2 },
  activeTitle: { fontFamily: 'Jakarta-Bold', fontSize: 22 },
  activeDestination: { fontFamily: 'Jakarta', fontSize: 14, marginBottom: 5 },
  sectionCard: { margin: 20, marginTop: 22, padding: 14, borderRadius: 22, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  sectionTitle: { fontFamily: 'Jakarta-Bold', fontSize: 18 },
  sectionCaption: { fontFamily: 'Jakarta', fontSize: 12, marginTop: 4 },
  mapFrame: { height: 180, overflow: 'hidden', borderRadius: 16 },
  recentHeader: { paddingHorizontal: 20, marginTop: 4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  empty: { paddingHorizontal: 20, marginTop: 14, fontFamily: 'Jakarta', fontSize: 14 },
});