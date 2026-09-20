import { Link, router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import { BrandLogo } from "@workspace/dame-pon-shared/components/BrandLogo";
import { BuildStamp } from "@workspace/dame-pon-shared/components/BuildStamp";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import InputField from "@workspace/dame-pon-shared/components/InputField";
import { InlineNotice } from "@workspace/dame-pon-shared/components/InlineNotice";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { icons } from "@workspace/dame-pon-shared/constants";

export default function SignIn() {
  const colors = useColors();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setNotice({ title: "Completa tus datos", message: "Escribe tu correo y contraseña." });
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setNotice({ title: "No pudimos iniciar sesión", message: result.error });
      return;
    }
    router.replace("/(root)/(tabs)/home");
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.hero, { backgroundColor: colors.background }]}>
          <BrandLogo style={styles.heroLogo} />
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Bienvenido a Dame Pon</Text>
          <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>Viajes claros y seguros en tu municipio</Text>
        </View>
        <View style={styles.form}>
          <InputField label="Correo electrónico" placeholder="tu@correo.com" icon={icons.email} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <InputField label="Contraseña" placeholder="••••••••" icon={icons.lock} secureTextEntry value={password} onChangeText={setPassword} />
          <CustomButton title="Iniciar sesión" onPress={() => void submit()} loading={loading} style={styles.button} />
          {notice ? <InlineNotice title={notice.title} message={notice.message} /> : null}
          <Link href="/sign-up" style={[styles.link, { color: colors.mutedForeground }]}>
            ¿No tienes una cuenta? <Text style={{ color: colors.primary }}>Regístrate</Text>
          </Link>
        </View>
        <View style={styles.stamp}><BuildStamp /></View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  screen: { flex: 1, paddingBottom: 24 },
  hero: { alignItems: "center", minHeight: 250, justifyContent: "center", paddingHorizontal: 24, paddingTop: 18 },
  heroLogo: { height: 116, marginBottom: 18, width: 116 },
  heroTitle: { fontFamily: "Jakarta-SemiBold", fontSize: 25, textAlign: "center" },
  heroSubtitle: { fontFamily: "Jakarta", fontSize: 14, marginTop: 8, textAlign: "center" },
  form: { padding: 20 },
  button: { marginTop: 4 },
  link: { fontFamily: "Jakarta-SemiBold", fontSize: 16, marginTop: 28, textAlign: "center" },
  stamp: { marginTop: 4 },
});