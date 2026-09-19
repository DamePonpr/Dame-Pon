import { Link, router } from "expo-router";
import { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import InputField from "@/components/InputField";
import { InlineNotice } from "@/components/InlineNotice";
import { useAuth } from "@/context/AuthContext";
import { icons, images } from "@/constants";
import { routeForRole } from "@/lib/roleRouting";

export default function SignIn() {
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-white">
      <View className="flex-1 bg-white">
        <View className="relative w-full h-[250px]">
          <Image source={images.signUpCar} className="z-0 w-full h-[250px]" resizeMode="cover" />
          <Text className="text-2xl text-black font-JakartaSemiBold absolute bottom-5 left-5">Bienvenido a Dame Pon</Text>
        </View>
        <View className="p-5">
          <InputField label="Correo electrónico" placeholder="tu@correo.com" icon={icons.email} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <InputField label="Contraseña" placeholder="••••••••" icon={icons.lock} secureTextEntry value={password} onChangeText={setPassword} />
          <CustomButton title="Iniciar sesión" onPress={() => void submit()} loading={loading} className="mt-4" />
          {notice ? <InlineNotice title={notice.title} message={notice.message} /> : null}
          <Link href="/sign-up" className="text-lg text-center text-general-200 mt-10">
            ¿No tienes una cuenta? <Text className="text-primary-500">Regístrate</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}