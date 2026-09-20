import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { DriverHome } from "@/components/DriverHome";
import { PassengerHome } from "@/components/PassengerHome";
import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";

export default function Home() {
  const colors = useColors();
  const auth = useAuth();
  const { profile, session, isLoading, authIssue } = auth;

  if (isLoading || (session && !profile && !authIssue)) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground, fontFamily: "Jakarta", fontSize: 14, marginTop: 12 }}>Cargando tu perfil…</Text></View>;
  }
  if (!session || !profile) return <Redirect href="/(auth)/sign-in" />;
  const Home = profile.role === "conductor" ? DriverHome : PassengerHome;
  return (
    <Home
      profile={profile}
      userId={session.user.id}
      onSignOut={() => void auth.signOut()}
      onSessionExpired={() => void auth.expireSession()}
    />
  );
}