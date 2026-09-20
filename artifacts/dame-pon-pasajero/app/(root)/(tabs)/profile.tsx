import { Image, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";

import InputField from "@workspace/dame-pon-shared/components/InputField";
import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import { BuildStamp } from "@workspace/dame-pon-shared/components/BuildStamp";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { icons } from "@/constants";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import { SettingsModal } from "@workspace/dame-pon-shared/components/SettingsModal";

export default function Profile() {
  const colors = useColors();
  const { user, profile, signOut } = useAuth();
  const [settingsVisible, setSettingsVisible] = useState(false);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.foreground }]}>Mi perfil</Text>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={[styles.initial, { color: colors.primary }]}>{(profile?.full_name ?? "D").slice(0, 1).toUpperCase()}</Text>}
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <InputField label="Nombre completo" value={profile?.full_name ?? ""} editable={false} />
          <InputField label="Correo electrónico" value={user?.email ?? ""} editable={false} keyboardType="email-address" icon={icons.email} />
          <InputField label="Teléfono" value={profile?.phone ?? "No registrado"} editable={false} icon={icons.person} />
          <InputField label="Rol" value={profile?.role === "conductor" ? "Conductor" : "Pasajero"} editable={false} icon={icons.profile} />
        </View>
        <CustomButton title="Apariencia" bgVariant="secondary" textVariant="secondary" onPress={() => setSettingsVisible(true)} style={styles.settings} />
        <CustomButton title="Cerrar sesión" bgVariant="outline" textVariant="secondary" onPress={() => void signOut()} style={styles.logout} />
        <View style={styles.stamp}><BuildStamp /></View>
      </ScrollView>
      <SettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 120, paddingHorizontal: 20 },
  heading: { fontFamily: "Jakarta-Bold", fontSize: 26, marginBottom: 20, marginTop: 20 },
  avatarWrap: { alignItems: "center", justifyContent: "center", marginBottom: 20 },
  avatar: { alignItems: "center", borderRadius: 55, height: 110, justifyContent: "center", overflow: "hidden", width: 110 },
  avatarImage: { height: 110, width: 110 },
  initial: { fontFamily: "Jakarta-Bold", fontSize: 40 },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 14 },
  logout: { marginTop: 24 },
  settings: { marginTop: 20 },
  stamp: { marginTop: 14 },
});