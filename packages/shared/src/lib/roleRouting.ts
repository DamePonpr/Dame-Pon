import type { UserRole } from "../lib/roles";

export type RoutedRole = UserRole;
export type RoleRoute = "/(root)/(tabs)/home";

export function routeForRole(role: RoutedRole | null | undefined): RoleRoute | null {
  return role === "conductor" || role === "pasajero" ? "/(root)/(tabs)/home" : null;
}

export function isHomeAuthorized(input: {
  isLoading: boolean;
  userId: string | null | undefined;
  profileId: string | null | undefined;
  profileRole: RoutedRole | null | undefined;
  expectedRole: RoutedRole;
}) {
  return !input.isLoading
    && Boolean(input.userId)
    && input.profileId === input.userId
    && input.profileRole === input.expectedRole;
}