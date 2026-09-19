import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import GoogleTextInput from "@/components/GoogleTextInput";
import { InlineNotice } from "@/components/InlineNotice";
import { RideLayout } from "@/components/RideLayout";
import { icons } from "@/constants";
import { useLocationStore } from "@/store";

export default function FindRide() {
  const { userLocation, destinationLocation, setDestinationLocation, setUserLocation } = useLocationStore();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <RideLayout title="Solicitar viaje">
      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">Desde</Text>
        <GoogleTextInput icon={icons.target} initialLocation={userLocation?.address ?? undefined} containerStyle="bg-neutral-100" textInputBackgroundColor="#f5f5f5" handlePress={setUserLocation} />
      </View>
      <View className="my-3">
        <Text className="text-lg font-JakartaSemiBold mb-3">Hasta</Text>
        <GoogleTextInput icon={icons.map} initialLocation={destinationLocation?.address ?? undefined} containerStyle="bg-neutral-100" textInputBackgroundColor="#f5f5f5" handlePress={setDestinationLocation} />
      </View>
      <CustomButton
        title="Revisar solicitud"
        onPress={() => {
          if (!userLocation || !destinationLocation) {
            setNotice("El origen y el destino deben estar dentro de Puerto Rico.");
            return;
          }
          setNotice(null);
          router.push("/(root)/confirm-ride");
        }}
        className="mt-5"
      />
      {notice ? <InlineNotice title="Selecciona ambas ubicaciones" message={notice} /> : null}
    </RideLayout>
  );
}