import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { iconSizes, radii, spacing, typography } from '@/constants/designSystem';
import type { TripParticipantDetails } from '@/lib/rideService';
import { ParticipantAvatar } from '@/components/ParticipantAvatar';

export function DriverCard({
  details,
  rating,
  compact = false,
}: {
  details: TripParticipantDetails | null;
  rating?: number | null;
  compact?: boolean;
}) {
  const colors = useColors();
  const name = details?.driver_name ?? 'Conductor asignado';
  const vehicle = [details?.vehicle_make, details?.vehicle_model, details?.vehicle_color]
    .filter(Boolean)
    .join(' · ') || 'Vehículo no disponible';
  const plate = details?.vehicle_plate ? `Tablilla ${details.vehicle_plate}` : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, compact && styles.compact]}>
      <ParticipantAvatar
        colors={colors}
        name={name}
        avatarUrl={details?.driver_avatar_url}
        fallback="C"
        size={compact ? 52 : 64}
      />
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>TU CONDUCTOR</Text>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        <View style={styles.ratingRow}>
          <Feather name="star" size={iconSizes.compact} color={colors.star} />
          <Text style={[styles.rating, { color: colors.foreground }]}>{rating == null ? '—' : rating.toFixed(1)}</Text>
        </View>
        <View style={styles.vehicleRow}>
          <Feather name="truck" size={iconSizes.compact} color={colors.primary} />
          <Text style={[styles.vehicle, { color: colors.mutedForeground }]} numberOfLines={2}>
            {vehicle}{plate ? ` · ${plate}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  compact: { padding: spacing.md },
  copy: { flex: 1, gap: spacing.xs },
  label: { fontFamily: typography.family.bold, fontSize: typography.size.eyebrow, letterSpacing: 1 },
  name: { fontFamily: typography.family.bold, fontSize: 18 },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  rating: { fontFamily: typography.family.semibold, fontSize: typography.size.caption },
  vehicleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6, marginTop: 2 },
  vehicle: { flex: 1, fontFamily: typography.family.regular, fontSize: typography.size.caption, lineHeight: 16 },
});