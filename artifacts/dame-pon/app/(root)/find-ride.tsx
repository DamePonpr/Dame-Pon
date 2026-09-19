import { router } from "expo-router";
import { Alert, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import GoogleTextInput from "@/components/GoogleTextInput";
import { RideLayout } from "@/components/RideLayout";
import { icons } from "@/constants";
import { useLocationStore } from "@/store";

export default function FindRide() {
  const { userLocation, destinationLocation, setDestinationLocation, setUserLocation } = useLocationStore();
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
            Alert.alert("Selecciona ambas ubicaciones", "El origen y el destino deben estar dentro de Puerto Rico.");
            return;
          }
          router.push("/(root)/confirm-ride");
        }}
        className="mt-5"
      />
    </RideLayout>
  );
}