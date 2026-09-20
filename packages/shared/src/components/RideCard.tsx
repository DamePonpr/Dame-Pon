import React from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { iconSizes, radii, spacing, typography } from '@/constants/designSystem';
import type { TripHistoryItem } from '@/lib/rideService';

export function RideCard({ item }: { item: TripHistoryItem }) {
  const colors = useColors();
  const date = new Date(item.trip.completed_at ?? item.trip.requested_at);
  const formattedDate = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
          <Feather name="map-pin" size={iconSizes.control} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.destination, { color: colors.foreground }]}>{item.trip.dropoff_address || item.trip.municipio_destino || 'Destino'}</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{formattedDate}</Text>
        </View>
        <Text style={[styles.status, { color: colors.primary }]}>Completado</Text>
      </View>
      <View style={[styles.route, { borderTopColor: colors.border }]}>
        <Text style={[styles.routeText, { color: colors.mutedForeground }]} numberOfLines={1}>Desde {item.trip.pickup_address || item.trip.municipio_origen || 'origen'}</Text>
        <View style={styles.ratingRow}>
          <Text style={[styles.ratingLabel, { color: colors.mutedForeground }]}>Enviada</Text>
          <Feather name="star" size={iconSizes.compact} color={item.sentRating == null ? colors.mutedForeground : colors.star} />
          <Text style={[styles.rating, { color: colors.foreground }]}>{item.sentRating ?? '—'}</Text>
          <Text style={[styles.ratingLabel, { color: colors.mutedForeground }]}>Recibida</Text>
          <Feather name="star" size={iconSizes.compact} color={item.receivedRating == null ? colors.mutedForeground : colors.star} />
          <Text style={[styles.rating, { color: colors.foreground }]}>{item.receivedRating ?? '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  top: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  icon: { alignItems: 'center', borderRadius: radii.sm, height: 40, justifyContent: 'center', width: 40 },
  copy: { flex: 1, gap: spacing.xs },
  destination: { fontFamily: typography.family.semibold, fontSize: typography.size.label },
  date: { fontFamily: typography.family.regular, fontSize: typography.size.caption },
  status: { fontFamily: typography.family.semibold, fontSize: typography.size.caption },
  route: { borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  routeText: { fontFamily: typography.family.regular, fontSize: typography.size.caption },
  ratingRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  ratingLabel: { fontFamily: typography.family.regular, fontSize: 11, marginLeft: spacing.sm },
  rating: { fontFamily: typography.family.semibold, fontSize: typography.size.caption },
});