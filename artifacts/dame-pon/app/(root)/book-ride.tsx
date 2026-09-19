import { router } from "expo-router";
import { Text, View } from "react-native";

import Payment from "@/components/Payment";
import RideLayout from "@/components/RideLayout";
import { useAuth } from "@/context/AuthContext";
import { useLocationStore } from "@/store";

export default function BookRide() {
  const { user } = useAuth();
  const { userLocation, destinationLocation } = useLocationStore();
  return (
    <RideLayout title="Publicar solicitud">
      <Text className="text-xl font-JakartaSemiBold mb-3">Todo listo</Text>
      <View className="rounded-3xl bg-general-600 px-5 py-4">
        <Text className="text-base font-JakartaSemiBold">{userLocation?.address ?? "Origen pendiente"}</Text>
        <Text className="text-base font-JakartaRegular my-2">↓</Text>
        <Text className="text-base font-JakartaSemiBold">{destinationLocation?.address ?? "Destino pendiente"}</Text>
      </View>
      <Payment fullName={user?.user_metadata?.full_name ?? ""} email={user?.email ?? ""} />
      <Text onPress={() => router.back()} className="text-center text-primary-500 font-JakartaSemiBold mt-5">Editar ubicaciones</Text>
    </RideLayout>
  );
}