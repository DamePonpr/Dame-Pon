import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RideCard } from "@workspace/dame-pon-shared/components/RideCard";
import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { getTripHistory, type TripHistoryItem } from "@workspace/dame-pon-shared/lib/rideService";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";

export default function Rides() {
  const colors = useColors();
  const { user, profile } = useAuth();
  const [rides, setRides] = useState<TripHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user || !profile) return;
    setLoading(true);
    const result = await getTripHistory(user.id, profile.role);
    setLoading(false);
    if (result.error) setError(result.error);
    else setRides(result.data ?? []);
  }, [profile, user]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={rides}
        renderItem={({ item }) => <RideCard item={item} />}
        keyExtractor={(item) => item.trip.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={[styles.heading, { color: colors.foreground }]}>Mis viajes</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{error || "Todavía no tienes viajes completados."}</Text>}
            {error ? <CustomButton title="Intentar de nuevo" onPress={() => void load()} style={styles.retry} /> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 120, paddingHorizontal: 20 },
  heading: { fontFamily: "Jakarta-Bold", fontSize: 26, marginBottom: 20, marginTop: 20 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyText: { fontFamily: "Jakarta", fontSize: 15, textAlign: "center" },
  retry: { marginTop: 20 },
});