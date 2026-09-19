export type RoutedRole = 'passenger' | 'driver';
export type RoleRoute = '/(root)/(tabs)/home';

export function routeForRole(role: RoutedRole | null | undefined): RoleRoute | null;

export function isHomeAuthorized(input: {
  isLoading: boolean;
  userId: string | null | undefined;
  profileId: string | null | undefined;
  profileRole: RoutedRole | null | undefined;
  expectedRole: RoutedRole;
}): boolean;