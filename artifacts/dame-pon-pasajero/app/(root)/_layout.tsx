import { Stack } from "expo-router";
import { RoleAccessBoundary } from "@workspace/dame-pon-shared/components/RoleAccessBoundary";

const Layout = () => {
  return (
    <RoleAccessBoundary expectedRole="pasajero">
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="find-ride" options={{ headerShown: false }} />
      <Stack.Screen
        name="confirm-ride"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="book-ride"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
    </RoleAccessBoundary>
  );
};

export default Layout;
