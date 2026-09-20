export function routeForRole(role) {
  if (role === 'conductor') return '/(root)/(tabs)/home';
  if (role === 'pasajero') return '/(root)/(tabs)/home';
  return null;
}

export function isHomeAuthorized({
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