import { Stack } from "expo-router";
import { RoleAccessBoundary } from "@workspace/dame-pon-shared/components/RoleAccessBoundary";

const Layout = () => {
  return (
    <RoleAccessBoundary expectedRole="conductor">
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
    </RoleAccessBoundary>
  );
};

export default Layout;
