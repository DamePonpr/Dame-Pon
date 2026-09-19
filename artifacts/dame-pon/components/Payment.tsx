import React, { useState } from "react";
import { Alert, Text } from "react-native";
import { router } from "expo-router";
import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { useAuth } from "@/context/AuthContext";
import { useLocationStore } from "@/store";
import { requestTrip } from "@/lib/rideService";
import type { PaymentProps } from "@/types/type";

export default function Payment({ amount }: PaymentProps) {
  const { user } = useAuth();
  const { userLocation, destinationLocation } = useLocationStore();
  const [loading, setLoading] = useState(false);

  async function confirmRide() {
    if (!user || !userLocation || !destinationLocation) {
      Alert.alert("Falta información", "Selecciona el origen y el destino antes de confirmar.");
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
      Alert.alert("No se pudo solicitar", result.error);
      return;
    }
    Alert.alert("Solicitud enviada", "Buscaremos un conductor disponible en tu municipio.", [
      { text: "Ver viaje", onPress: () => router.replace("/(root)/(tabs)/rides") },
    ]);
  }

  return (
    <>
      <Text className="text-base font-JakartaRegular text-general-200 mt-4">
        El pago se coordina fuera de la app. Este paso solo crea la solicitud protegida del viaje.
      </Text>
      <CustomButton title={`Confirmar solicitud${amount ? ` · $${amount}` : ""}`} loading={loading} onPress={confirmRide} className="mt-6" />
    </>
  );
}