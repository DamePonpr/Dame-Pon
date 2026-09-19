import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import RideCard from "@/components/RideCard";
import CustomButton from "@/components/CustomButton";
import { useAuth } from "@/context/AuthContext";
import { getTripHistory, type TripHistoryItem } from "@/lib/rideService";
import { useColors } from "@/hooks/useColors";

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
    <SafeAreaView className="flex-1 bg-white">
      <FlatList
        data={rides}
        renderItem={({ item }) => <RideCard item={item} />}
        keyExtractor={(item) => item.trip.id}
        className="px-5"
        contentContainerStyle={{ paddingBottom: 120 }}
        ListHeaderComponent={<Text className="text-2xl font-JakartaBold my-5">Mis viajes</Text>}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            {loading ? <ActivityIndicator color={colors.primary} /> : <Text className="text-base text-gray-500">{error || "Todavía no tienes viajes completados."}</Text>}
            {error ? <CustomButton title="Intentar de nuevo" onPress={() => void load()} className="mt-5" /> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}