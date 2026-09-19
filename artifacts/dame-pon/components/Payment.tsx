import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { InlineNotice } from "@/components/InlineNotice";
import { useAuth } from "@/context/AuthContext";
import { useLocationStore } from "@/store";
import { requestTrip } from "@/lib/rideService";
import type { PaymentProps } from "@/types/type";

export default function Payment({ amount }: PaymentProps) {
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
      <Text className="text-base font-JakartaRegular text-general-200 mt-4">
        El pago se coordina fuera de la app. Este paso solo crea la solicitud protegida del viaje.
      </Text>
      <CustomButton title={`Confirmar solicitud${amount ? ` · $${amount}` : ""}`} loading={loading} onPress={confirmRide} className="mt-6" />
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