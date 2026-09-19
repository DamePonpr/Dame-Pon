export function routeForRole(role) {
  if (role === 'driver') return '/(root)/(tabs)/home';
  if (role === 'passenger') return '/(root)/(tabs)/home';
  return null;
}

export function isRoleHomeAuthorized({
  isLoading,
  userId,
  profileId,
  profileRole,
  expectedRole,
}) {
  return !isLoading
    && Boolean(userId)
    && profileId === userId
    && profileRole === expectedRole;
}