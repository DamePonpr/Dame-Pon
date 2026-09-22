import { Link, router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BrandLogo } from "@workspace/dame-pon-shared/components/BrandLogo";
import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import InputField from "@workspace/dame-pon-shared/components/InputField";
import { InlineNotice } from "@workspace/dame-pon-shared/components/InlineNotice";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import type { UserRole } from "@workspace/dame-pon-shared/lib/roles";
import { icons } from "@workspace/dame-pon-shared/constants";
import { MunicipalityPicker } from "@workspace/dame-pon-shared/components/MunicipalityPicker";
import type { Municipality } from "@workspace/dame-pon-shared/lib/municipality";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SignUp() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", baseMunicipality: "" });
  const [role, setRole] = useState<UserRole>("pasajero");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string; action?: boolean } | null>(null);

  async function submit() {
    if (!form.name.trim() || !form.email.trim() || !form.password || !form.phone.trim()) {
      setNotice({ title: "Completa tus datos", message: "Nombre, correo, teléfono y contraseña son obligatorios." });
      return;
    }
    if (role === "conductor" && !form.baseMunicipality.trim()) {
      setNotice({ title: "Falta el municipio base", message: "Los conductores deben indicar su municipio base." });
      return;
    }
    setLoading(true);
    const result = await signUp({
      email: form.email,
      password: form.password,
      fullName: form.name,
      phone: form.phone,
      role,
      baseMunicipality: role === "conductor" ? form.baseMunicipality : undefined,
    });
    setLoading(false);
    if (result.error) {
      setNotice({ title: "No pudimos crear la cuenta", message: result.error === "PHONE_ALREADY_REGISTERED" ? "Ese teléfono ya está registrado." : result.error });
      return;
    }
    if (result.needsEmailConfirmation) {
      setNotice({ title: "Confirma tu correo", message: "Revisa tu correo electrónico y luego inicia sesión.", action: true });
      return;
    }
    router.replace("/onboarding");
  }

  return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        keyboardShouldPersistTaps="handled"
      >
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.hero, { backgroundColor: colors.background }]}>
          <BrandLogo role="conductor" style={styles.heroLogo} />
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Crea tu cuenta</Text>
          <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>Elige cómo quieres usar Dame Pon</Text>
        </View>
        <View style={styles.form}>
          <InputField label="Nombre completo" placeholder="Tu nombre" icon={icons.person} value={form.name} onChangeText={(value) => setForm({ ...form, name: value })} />
          <InputField label="Correo electrónico" placeholder="tu@correo.com" icon={icons.email} keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => setForm({ ...form, email: value })} />
          <InputField label="Teléfono" placeholder="787-000-0000" icon={icons.person} keyboardType="phone-pad" value={form.phone} onChangeText={(value) => setForm({ ...form, phone: value })} />
          <InputField label="Contraseña" placeholder="••••••••" icon={icons.lock} secureTextEntry value={form.password} onChangeText={(value) => setForm({ ...form, password: value })} />
          <Text style={[styles.roleLabel, { color: colors.foreground }]}>Quiero usar Dame Pon como</Text>
          <View style={styles.roleRow}>
            <CustomButton title="Pasajero" bgVariant={role === "pasajero" ? "primary" : "outline"} textVariant={role === "pasajero" ? "default" : "secondary"} onPress={() => setRole("pasajero")} style={styles.roleButton} />
            <CustomButton title="Conductor" bgVariant={role === "conductor" ? "primary" : "outline"} textVariant={role === "conductor" ? "default" : "secondary"} onPress={() => setRole("conductor")} style={styles.roleButton} />
          </View>
          {role === "conductor" ? (
            <MunicipalityPicker
              label="Municipio base"
              value={form.baseMunicipality}
              icon={icons.map}
              onSelect={(municipality: Municipality) => setForm({ ...form, baseMunicipality: municipality.nombre })}
            />
          ) : null}
          <CustomButton title="Crear cuenta" onPress={() => void submit()} loading={loading} style={styles.button} />
          {notice ? (
            <InlineNotice
              title={notice.title}
              message={notice.message}
              actionLabel={notice.action ? "Ir a iniciar sesión" : undefined}
              onAction={notice.action ? () => router.replace("/(auth)/sign-in") : undefined}
            />
          ) : null}
          <Link href="/sign-in" style={[styles.link, { color: colors.mutedForeground }]}>
            ¿Ya tienes una cuenta? <Text style={{ color: colors.primary }}>Inicia sesión</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  screen: { flex: 1 },
  hero: { alignItems: "center", minHeight: 220, justifyContent: "center", paddingHorizontal: 24, paddingTop: 12 },
  heroLogo: { height: 96, marginBottom: 14, width: 96 },
  heroTitle: { fontFamily: "Jakarta-SemiBold", fontSize: 25, textAlign: "center" },
  heroSubtitle: { fontFamily: "Jakarta", fontSize: 14, marginTop: 8, textAlign: "center" },
  form: { padding: 20 },
  roleLabel: { fontFamily: "Jakarta-SemiBold", fontSize: 16, marginBottom: 12, marginTop: 2 },
  roleRow: { flexDirection: "row", gap: 12 },
  roleButton: { flex: 1, paddingHorizontal: 10 },
  button: { marginTop: 16 },
  link: { fontFamily: "Jakarta-SemiBold", fontSize: 16, marginTop: 28, textAlign: "center" },
});