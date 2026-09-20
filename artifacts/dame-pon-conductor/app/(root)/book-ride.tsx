import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import Payment from "@/components/Payment";
import { RideLayout } from "@workspace/dame-pon-shared/components/RideLayout";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import { useLocationStore } from "@/store";

export default function BookRide() {
  const colors = useColors();
  const { user } = useAuth();
  const { userLocation, destinationLocation } = useLocationStore();
  return (
    <RideLayout title="Publicar solicitud">
      <Text style={[styles.title, { color: colors.foreground }]}>Todo listo</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.value, { color: colors.foreground }]}>{userLocation?.address ?? "Origen pendiente"}</Text>
        <Text style={[styles.arrow, { color: colors.primary }]}>↓</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>{destinationLocation?.address ?? "Destino pendiente"}</Text>
      </View>
      <Payment fullName={user?.user_metadata?.full_name ?? ""} email={user?.email ?? ""} />
      <Text onPress={() => router.back()} style={[styles.edit, { color: colors.primary }]}>Editar ubicaciones</Text>
    </RideLayout>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Jakarta-SemiBold", fontSize: 20, marginBottom: 12 },
  card: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16 },
  value: { fontFamily: "Jakarta-SemiBold", fontSize: 16 },
  arrow: { fontFamily: "Jakarta-Bold", fontSize: 20, marginVertical: 8 },
  edit: { fontFamily: "Jakarta-SemiBold", fontSize: 15, marginTop: 20, textAlign: "center" },
});