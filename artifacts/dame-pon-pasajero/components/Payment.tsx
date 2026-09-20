import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { InlineNotice } from "@/components/InlineNotice";
import { useAuth } from "@/context/AuthContext";
import { useLocationStore } from "@/store";
import { requestTrip } from "@/lib/rideService";
import type { PaymentProps } from "@/types/type";
import { useColors } from "@/hooks/useColors";

export default function Payment({ amount }: PaymentProps) {
  const colors = useColors();
  const { user } = useAuth();
  const { userLocation, destinationLocation } = useLocationStore();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; action?: boolean } | null>(null);

  async function confirmRide() {
    if (!user || !userLocation || !destinationLocation) {
      setNotice({ title: "Falta información", message: "Selecciona el origen y el destino antes de confirmar." });
      return;
    }
    setLoading(true);
    const result = await requestTrip(
      user.id,
      destinationLocation.address,
      userLocation,
      { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
    );
    setLoading(false);
    if (result.error) {
      setNotice({ title: "No se pudo solicitar", message: result.error });
      return;
    }
    setNotice({ title: "Solicitud enviada", message: "Buscaremos un conductor disponible en tu municipio.", action: true });
  }

  return (
    <>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        El pago se coordina fuera de la app. Este paso solo crea la solicitud protegida del viaje.
      </Text>
      <CustomButton title={`Confirmar solicitud${amount ? ` · $${amount}` : ""}`} loading={loading} onPress={confirmRide} style={styles.button} />
      {notice ? (
        <InlineNotice
          title={notice.title}
          message={notice.message}
          actionLabel={notice.action ? "Ver viaje" : undefined}
          onAction={notice.action ? () => router.replace("/(root)/(tabs)/rides") : undefined}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  description: { fontFamily: "Jakarta", fontSize: 15, lineHeight: 22, marginTop: 16 },
  button: { marginTop: 24 },
});