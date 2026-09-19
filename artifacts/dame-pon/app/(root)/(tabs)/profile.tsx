import { Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import InputField from "@/components/InputField";
import CustomButton from "@/components/CustomButton";
import { BuildStamp } from "@/components/BuildStamp";
import { useAuth } from "@/context/AuthContext";
import { icons } from "@/constants";

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 120 }}>
        <Text className="text-2xl font-JakartaBold my-5">Mi perfil</Text>
        <View className="flex items-center justify-center my-5">
          <View className="h-[110px] w-[110px] rounded-full bg-[#081321] items-center justify-center">
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} className="h-[110px] w-[110px] rounded-full" /> : <Text className="text-4xl text-white font-JakartaBold">{(profile?.full_name ?? "D").slice(0, 1).toUpperCase()}</Text>}
          </View>
        </View>
        <View className="flex flex-col items-start justify-center bg-white rounded-lg shadow-sm shadow-neutral-300 px-5 py-3">
          <InputField label="Nombre completo" value={profile?.full_name ?? ""} editable={false} />
          <InputField label="Correo electrónico" value={user?.email ?? ""} editable={false} keyboardType="email-address" icon={icons.email} />
          <InputField label="Teléfono" value={profile?.phone ?? "No registrado"} editable={false} icon={icons.person} />
          <InputField label="Rol" value={profile?.role === "conductor" ? "Conductor" : "Pasajero"} editable={false} icon={icons.profile} />
        </View>
        <CustomButton title="Cerrar sesión" bgVariant="outline" textVariant="secondary" onPress={() => void signOut()} className="mt-6" />
        <BuildStamp />
      </ScrollView>
    </SafeAreaView>
  );
}