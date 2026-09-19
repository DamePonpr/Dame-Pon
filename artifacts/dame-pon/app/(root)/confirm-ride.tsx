import { router } from "expo-router";
import { Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { useLocationStore } from "@/store";

export default function ConfirmRide() {
  const { userLocation, destinationLocation } = useLocationStore();
  return (
    <RideLayout title="Confirma tu viaje">
      <View className="rounded-3xl bg-general-600 p-5 mt-4">
        <Text className="text-xs font-JakartaBold text-general-200">ORIGEN</Text>
        <Text className="text-base font-JakartaSemiBold mt-1">{userLocation?.address ?? "No seleccionado"}</Text>
        <Text className="text-xs font-JakartaBold text-general-200 mt-5">DESTINO</Text>
        <Text className="text-base font-JakartaSemiBold mt-1">{destinationLocation?.address ?? "No seleccionado"}</Text>
      </View>
      <Text className="text-base font-JakartaRegular text-general-200 mt-5">La solicitud se publicará para conductores aprobados del municipio activo. No se realiza ningún cobro desde esta pantalla.</Text>
      <CustomButton title="Continuar" onPress={() => router.push("/(root)/book-ride")} className="mt-6" />
    </RideLayout>
  );
}