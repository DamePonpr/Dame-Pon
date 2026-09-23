export interface ProfileCompletionInput {
  full_name?: string | null;
  phone?: string | null;
  onboarding_completed?: boolean | null;
  role?: PhoneRole | null;
}

export type PhoneRole = 'pasajero' | 'conductor';

const PUERTO_RICO_AREA_CODES = ['787', '939'] as const;

export function normalizePhoneDigits(phone: string | null | undefined) {
  return (phone ?? '').replace(/\D/g, '');
}

function getNanpNationalNumber(phone: string | null | undefined) {
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function isValidNanpNationalNumber(nationalNumber: string) {
  return nationalNumber.length === 10
    && /^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber);
}

function hasInternationalPrefix(phone: string | null | undefined) {
  return (phone ?? '').trim().startsWith('+');
}

export function isValidPuertoRicoPhone(phone: string | null | undefined) {
  const digits = normalizePhoneDigits(phone);
  if (!digits || /^0+$/.test(digits)) return false;

  const nationalNumber = getNanpNationalNumber(phone);
  return isValidNanpNationalNumber(nationalNumber)
    && PUERTO_RICO_AREA_CODES.some((areaCode) => nationalNumber.startsWith(areaCode));
}

export function isValidPassengerPhone(phone: string | null | undefined) {
  const digits = normalizePhoneDigits(phone);
  if (!digits || /^0+$/.test(digits) || digits.length < 10 || digits.length > 15) return false;

  const nationalNumber = getNanpNationalNumber(phone);
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
    return isValidNanpNationalNumber(nationalNumber);
  }

  return hasInternationalPrefix(phone) && /^[2-9]\d{9,14}$/.test(digits);
}

export function isValidPhone(phone: string | null | undefined, role: PhoneRole = 'pasajero') {
  return role === 'conductor' ? isValidPuertoRicoPhone(phone) : isValidPassengerPhone(phone);
}

export function normalizePhoneForRole(phone: string | null | undefined, role: PhoneRole = 'pasajero') {
  if (!isValidPhone(phone, role)) return null;
  const digits = normalizePhoneDigits(phone);
  const nationalNumber = digits.length === 10
    ? digits
    : digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;

  if (isValidNanpNationalNumber(nationalNumber)) return `+1${nationalNumber}`;
  return `+${digits}`;
}

export function profileMissingFields(profile: ProfileCompletionInput | null | undefined) {
  const missing: string[] = [];
  if (!profile?.full_name?.trim()) missing.push('nombre completo');
  if (!isValidPhone(profile?.phone, profile?.role ?? 'pasajero')) missing.push('teléfono');
  if (!profile?.onboarding_completed) missing.push('configuración inicial');
  return missing;
}

export function isProfileComplete(profile: ProfileCompletionInput | null | undefined) {
  return profileMissingFields(profile).length === 0;
}