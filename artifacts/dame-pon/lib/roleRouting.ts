import type { UserRole } from "@/context/AuthContext";

export type RoutedRole = UserRole;
export type RoleRoute = "/(root)/(tabs)/home";

export function routeForRole(role: RoutedRole | null | undefined): RoleRoute | null {
  return role === "driver" || role === "passenger" ? "/(root)/(tabs)/home" : null;
}

export function isRoleHomeAuthorized(input: {
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