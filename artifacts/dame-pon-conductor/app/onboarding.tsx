import { Redirect } from 'expo-router';

import { DriverOnboarding } from '../components/DriverOnboarding';
import { useAuth } from '@workspace/dame-pon-shared/context/AuthContext';
import { RoleAccessBoundary } from '@workspace/dame-pon-shared/components/RoleAccessBoundary';

export default function OnboardingRoute() {
  const { profile } = useAuth();
  return (
    <RoleAccessBoundary expectedRole="conductor" requireOnboarding={false}>
      {profile?.onboarding_completed ? <Redirect href="/(root)/(tabs)/home" /> : <DriverOnboarding />}
    </RoleAccessBoundary>
  );
}