import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { RoleHome } from "@/components/RoleHome";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function Home() {
  const colors = useColors();
  const { profile, session, isLoading, authIssue } = useAuth();

  if (isLoading || (session && !profile && !authIssue)) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!session || !profile) return <Redirect href="/(auth)/sign-in" />;
  return <RoleHome role={profile.role} />;
}