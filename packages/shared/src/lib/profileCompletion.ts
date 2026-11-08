import type { SupabaseClient } from '@supabase/supabase-js';

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

  return hasInternationalPrefix(phone)
    && !digits.startsWith('999')
    && /^[2-9]\d{9,14}$/.test(digits);
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

export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role: PhoneRole;
  baseMunicipality?: string;
}

interface RegistrationRequest {
  email: string;
  password: string;
  options: {
    data: {
      full_name: string;
      phone: string;
      role: PhoneRole;
      base_municipality?: string;
    };
  };
}

// Reads only: account creation remains in the existing AuthProvider.
export async function prepareRegistration(
  client: Pick<SupabaseClient, 'from' | 'rpc'>,
  input: RegistrationInput,
  appRole: PhoneRole,
): Promise<{ request: RegistrationRequest | null; error: string | null }> {
  const invalid = (error: string) => ({ request: null, error });
  if (!['pasajero', 'conductor'].includes(appRole) || input.role !== appRole) {
    return invalid('REGISTRATION_ROLE_MISMATCH');
  }
  if (!input.fullName?.trim()) return invalid('INVALID_FULL_NAME');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email?.trim() ?? '')) {
    return invalid('INVALID_EMAIL');
  }
  if (typeof input.password !== 'string' || input.password.length < 6) {
    return invalid('INVALID_PASSWORD');
  }
  const phone = normalizePhoneForRole(input.phone, appRole);
  if (!phone) return invalid('INVALID_PHONE');

  let baseMunicipality: string | undefined;
  if (appRole === 'conductor') {
    const selected = typeof input.baseMunicipality === 'string'
      ? input.baseMunicipality.normalize('NFC').trim()
      : '';
    if (!selected || selected.length > 100) return invalid('INVALID_BASE_MUNICIPALITY');
    const municipality = await client
      .from('municipios')
      .select('nombre')
      .eq('nombre', selected)
      .maybeSingle();
    if (municipality.error) return invalid('MUNICIPALITY_UNAVAILABLE');
    if (!municipality.data || municipality.data.nombre !== selected) {
      return invalid('INVALID_BASE_MUNICIPALITY');
    }
    baseMunicipality = municipality.data.nombre;
  }

  const availability = await client.rpc('is_phone_available', { p_phone: phone });
  if (availability.error) return invalid(availability.error.message);
  if (availability.data === false) return invalid('PHONE_ALREADY_REGISTERED');
  if (availability.data !== true) return invalid('PHONE_CHECK_UNAVAILABLE');

  return {
    error: null,
    request: {
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          full_name: input.fullName.trim(),
          phone,
          role: appRole,
          ...(appRole === 'conductor' ? { base_municipality: baseMunicipality } : {}),
        },
      },
    },
  };
}

export function registrationErrorMessage(error: string, role: PhoneRole) {
  const messages: Record<string, string> = {
    REGISTRATION_ROLE_MISMATCH: 'Esta app solo permite registrar cuentas de su propio rol.',
    INVALID_FULL_NAME: 'Escribe tu nombre completo.',
    INVALID_EMAIL: 'Escribe un correo electrónico válido.',
    INVALID_PASSWORD: 'La contraseña debe tener al menos 6 caracteres.',
    INVALID_PHONE: role === 'conductor'
      ? 'Usa un teléfono válido de Puerto Rico con código 787 o 939.'
      : 'Escribe un teléfono válido; para otros países incluye el código internacional.',
    INVALID_BASE_MUNICIPALITY: 'Selecciona un municipio base válido del catálogo.',
    MUNICIPALITY_UNAVAILABLE: 'No pudimos verificar el municipio. Revisa tu conexión y vuelve a intentarlo.',
    PHONE_ALREADY_REGISTERED: 'Ese teléfono ya está registrado.',
    PHONE_CHECK_UNAVAILABLE: 'No pudimos verificar el teléfono. Vuelve a intentarlo.',
    ALREADY_SIGNED_IN: 'Cierra tu sesión antes de registrar otra cuenta.',
  };
  return messages[error] ?? error;
}