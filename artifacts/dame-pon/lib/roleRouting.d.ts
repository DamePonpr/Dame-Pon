export type RoutedRole = 'passenger' | 'driver';
export type RoleRoute = '/home/passenger' | '/home/driver';

export function routeForRole(role: RoutedRole | null | undefined): RoleRoute | null;

export function isRoleHomeAuthorized(input: {
  isLoading: boolean;
  userId: string | null | undefined;
  profileId: string | null | undefined;
  profileRole: RoutedRole | null | undefined;
  expectedRole: RoutedRole;
}): boolean;