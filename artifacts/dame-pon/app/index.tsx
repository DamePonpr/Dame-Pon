import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { routeForRole } from "@/lib/roleRouting";

export default function IndexScreen() {
  const colors = useColors();
  const { session, profile, isLoading, authIssue } = useAuth();

  if (isLoading || (session && !profile && !authIssue)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session || authIssue === "session_expired" || authIssue === "profile_unavailable") {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Redirect href={routeForRole(profile?.role) ?? "/(auth)/sign-in"} />;
}