export interface ProfileCompletionInput {
  full_name?: string | null;
  phone?: string | null;
  onboarding_completed?: boolean | null;
}

const PUERTO_RICO_AREA_CODES = ['787', '939'] as const;

export function normalizePhoneDigits(phone: string | null | undefined) {
  return (phone ?? '').replace(/\D/g, '');
}

export function isValidPuertoRicoPhone(phone: string | null | undefined) {
  const digits = normalizePhoneDigits(phone);
  if (!digits || /^0+$/.test(digits)) return false;

  const nationalNumber = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;

  return nationalNumber.length === 10
    && PUERTO_RICO_AREA_CODES.some((areaCode) => nationalNumber.startsWith(areaCode));
}

export function profileMissingFields(profile: ProfileCompletionInput | null | undefined) {
  const missing: string[] = [];
  if (!profile?.full_name?.trim()) missing.push('nombre completo');
  if (!isValidPuertoRicoPhone(profile?.phone)) missing.push('teléfono');
  if (!profile?.onboarding_completed) missing.push('configuración inicial');
  return missing;
}

export function isProfileComplete(profile: ProfileCompletionInput | null | undefined) {
  return profileMissingFields(profile).length === 0;
}