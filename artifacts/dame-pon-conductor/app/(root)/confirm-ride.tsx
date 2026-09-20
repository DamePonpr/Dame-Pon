import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import { RideLayout } from "@workspace/dame-pon-shared/components/RideLayout";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import { useLocationStore } from "@/store";

export default function ConfirmRide() {
  const colors = useColors();
  const { userLocation, destinationLocation } = useLocationStore();
  return (
    <RideLayout title="Confirma tu viaje">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>ORIGEN</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>{userLocation?.address ?? "No seleccionado"}</Text>
        <Text style={[styles.eyebrow, styles.destinationLabel, { color: colors.mutedForeground }]}>DESTINO</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>{destinationLocation?.address ?? "No seleccionado"}</Text>
      </View>
      <Text style={[styles.info, { color: colors.mutedForeground }]}>La solicitud se publicará para conductores aprobados del municipio activo. No se realiza ningún cobro desde esta pantalla.</Text>
      <CustomButton title="Continuar" onPress={() => router.push("/(root)/book-ride")} style={styles.button} />
    </RideLayout>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, marginTop: 16, padding: 20 },
  eyebrow: { fontFamily: "Jakarta-Bold", fontSize: 12, letterSpacing: 0.8 },
  value: { fontFamily: "Jakarta-SemiBold", fontSize: 16, marginTop: 5 },
  destinationLabel: { marginTop: 20 },
  info: { fontFamily: "Jakarta", fontSize: 15, lineHeight: 22, marginTop: 20 },
  button: { marginTop: 24 },
});