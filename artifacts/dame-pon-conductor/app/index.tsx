import { ActivityIndicator, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@workspace/dame-pon-shared/context/AuthContext";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";
import { routeForRole } from "@workspace/dame-pon-shared/lib/roleRouting";

export default function IndexScreen() {
  const colors = useColors();
  const { session, profile, isLoading, authIssue } = useAuth();

  if (isLoading || (session && !profile && !authIssue)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Jakarta", fontSize: 14, marginTop: 12 }}>Cargando tu perfil…</Text>
      </View>
    );
  }

  if (!session || authIssue === "session_expired" || authIssue === "profile_unavailable") {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!profile?.onboarding_completed) {
    return <Redirect href={"/onboarding" as never} />;
  }

  return <Redirect href={routeForRole(profile?.role) ?? "/(auth)/sign-in"} />;
}