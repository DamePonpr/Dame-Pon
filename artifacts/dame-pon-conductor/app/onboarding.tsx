import { Redirect } from 'expo-router';

import { DriverOnboarding } from '../components/DriverOnboarding';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';

export default function OnboardingRoute() {
  const { profile, session } = useAuth();
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (profile?.role === 'pasajero') return <Redirect href="/(root)/(tabs)/home" />;
  return <DriverOnboarding />;
}