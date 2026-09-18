export function routeForRole(role) {
  if (role === 'driver') return '/home/driver';
  if (role === 'passenger') return '/home/passenger';
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