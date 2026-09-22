import { Redirect } from 'expo-router';

import { PassengerOnboarding } from '../components/PassengerOnboarding';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';

export default function OnboardingRoute() {
  const { profile, session } = useAuth();
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (profile?.role === 'conductor') return <Redirect href="/(root)/(tabs)/home" />;
  if (profile?.onboarding_completed) return <Redirect href="/(root)/(tabs)/home" />;
  return <PassengerOnboarding />;
}