import { Link, router } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import { InlineNotice } from "@/components/InlineNotice";
import { useAuth } from "@/context/AuthContext";
import type { UserRole } from "@/lib/roles";
import { icons, images } from "@/constants";

export default function SignUp() {
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
    router.replace("/(root)/(tabs)/home");
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-white">
      <View className="flex-1 bg-white">
        <View className="relative w-full h-[220px]">
          <Image source={images.signUpCar} className="z-0 w-full h-[220px]" resizeMode="cover" />
          <Text className="text-2xl text-black font-JakartaSemiBold absolute bottom-5 left-5">Crea tu cuenta</Text>
        </View>
        <View className="p-5">
          <InputField label="Nombre completo" placeholder="Tu nombre" icon={icons.person} value={form.name} onChangeText={(value) => setForm({ ...form, name: value })} />
          <InputField label="Correo electrónico" placeholder="tu@correo.com" icon={icons.email} keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => setForm({ ...form, email: value })} />
          <InputField label="Teléfono" placeholder="787-000-0000" icon={icons.person} keyboardType="phone-pad" value={form.phone} onChangeText={(value) => setForm({ ...form, phone: value })} />
          <InputField label="Contraseña" placeholder="••••••••" icon={icons.lock} secureTextEntry value={form.password} onChangeText={(value) => setForm({ ...form, password: value })} />
          <Text className="text-base font-JakartaSemiBold mt-2 mb-3">Quiero usar Dame Pon como</Text>
          <View className="flex-row gap-3">
            <CustomButton title="Pasajero" bgVariant={role === "pasajero" ? "primary" : "outline"} textVariant={role === "pasajero" ? "default" : "secondary"} onPress={() => setRole("pasajero")} className="flex-1" />
            <CustomButton title="Conductor" bgVariant={role === "conductor" ? "primary" : "outline"} textVariant={role === "conductor" ? "default" : "secondary"} onPress={() => setRole("conductor")} className="flex-1" />
          </View>
          {role === "conductor" ? <InputField label="Municipio base" placeholder="Ej. Bayamón" icon={icons.map} value={form.baseMunicipality} onChangeText={(value) => setForm({ ...form, baseMunicipality: value })} /> : null}
          <CustomButton title="Crear cuenta" onPress={() => void submit()} loading={loading} className="mt-4" />
          {notice ? (
            <InlineNotice
              title={notice.title}
              message={notice.message}
              actionLabel={notice.action ? "Ir a iniciar sesión" : undefined}
              onAction={notice.action ? () => router.replace("/(auth)/sign-in") : undefined}
            />
          ) : null}
          <Link href="/sign-in" className="text-lg text-center text-general-200 mt-10">
            ¿Ya tienes una cuenta? <Text className="text-primary-500">Inicia sesión</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}