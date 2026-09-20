import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import GoogleTextInput from "@/components/GoogleTextInput";
import { InlineNotice } from "@/components/InlineNotice";
import { RideLayout } from "@/components/RideLayout";
import { icons } from "@/constants";
import { useColors } from "@/hooks/useColors";
import { useLocationStore } from "@/store";

export default function FindRide() {
  const colors = useColors();
  const { userLocation, destinationLocation, setDestinationLocation, setUserLocation } = useLocationStore();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <RideLayout title="Solicitar viaje">
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.foreground }]}>Desde</Text>
        <GoogleTextInput icon={icons.target} initialLocation={userLocation?.address ?? undefined} textInputBackgroundColor={colors.card} handlePress={setUserLocation} />
      </View>
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.foreground }]}>Hasta</Text>
        <GoogleTextInput icon={icons.map} initialLocation={destinationLocation?.address ?? undefined} textInputBackgroundColor={colors.card} handlePress={setDestinationLocation} />
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
        style={styles.button}
      />
      {notice ? <InlineNotice title="Selecciona ambas ubicaciones" message={notice} /> : null}
    </RideLayout>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 12 },
  label: { fontFamily: "Jakarta-SemiBold", fontSize: 18, marginBottom: 12 },
  button: { marginTop: 8 },
});