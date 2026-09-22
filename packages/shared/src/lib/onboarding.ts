import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PaymentMethod = 'cash' | 'card';
export type OnboardingDocumentTable = 'driver' | 'vehicle';

export interface PassengerOnboardingState {
  completed: boolean;
  paymentMethod: PaymentMethod;
  avatarUrl: string | null;
}

export interface OnboardingDocument {
  id: string;
  doc_type: string;
  status: string;
  storage_path: string;
  review_notes: string | null;
}

export interface DriverOnboardingState {
  approvalStatus: string;
  onboardingStep: number;
  reviewNotes: string | null;
  vehicleId: string | null;
  driverDocuments: OnboardingDocument[];
  vehicleDocuments: OnboardingDocument[];
  acceptedAgreementKeys: string[];
  activationCode: string | null;
  activationExpiresAt: string | null;
  activatedAt: string | null;
}

export interface DriverVehicleDraft {
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  vin: string;
  seats: string;
}

export const DRIVER_AGREEMENTS = [
  {
    key: 'terms_of_service',
    title: 'Términos de uso de Dame Pon',
    body: 'BORRADOR pendiente de revisión legal\n\nEstos términos describen el uso de la plataforma Dame Pon, las responsabilidades de sus participantes y las reglas de servicio.',
  },
  {
    key: 'driver_service',
    title: 'Acuerdo de prestación del servicio',
    body: 'BORRADOR pendiente de revisión legal\n\nEl conductor se compromete a ofrecer un servicio respetuoso, seguro y conforme a la información aprobada en su perfil.',
  },
  {
    key: 'privacy',
    title: 'Aviso de privacidad',
    body: 'BORRADOR pendiente de revisión legal\n\nDame Pon utiliza los datos necesarios para coordinar viajes, revisar documentos y proteger a la comunidad.',
  },
  {
    key: 'safety',
    title: 'Compromiso de seguridad',
    body: 'BORRADOR pendiente de revisión legal\n\nEl conductor acepta seguir las instrucciones de seguridad, mantener su vehículo en condiciones aptas y reportar incidentes.',
  },
  {
    key: 'document_declaration',
    title: 'Declaración de documentos',
    body: 'BORRADOR pendiente de revisión legal\n\nEl conductor declara que los documentos enviados le corresponden y que la información suministrada es correcta.',
  },
] as const;

const AGREEMENT_VERSION = 'preview-30-draft-1';

function errorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message ?? fallback;
}

async function uploadImage(bucket: string, userId: string, prefix: string, uri: string, mimeType = 'image/jpeg') {
  const response = await fetch(uri);
  if (!response.ok) return { path: null, error: 'No pudimos leer la imagen seleccionada.' };
  const body = await response.arrayBuffer();
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${prefix}-${Date.now()}.${extension}`;
  const result = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: false,
  });
  if (result.error) return { path: null, error: result.error.message };
  return { path, error: null };
}

export async function getPassengerOnboardingState(userId: string) {
  const result = await supabase
    .from('profiles')
    .select('onboarding_completed,default_payment_method,avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (result.error) {
    return { data: null, error: errorMessage(result.error, 'No pudimos cargar tu onboarding.') };
  }
  return {
    data: {
      completed: Boolean(result.data?.onboarding_completed),
      paymentMethod: result.data?.default_payment_method === 'card' ? 'card' : 'cash',
      avatarUrl: result.data?.avatar_url ?? null,
    } satisfies PassengerOnboardingState,
    error: null,
  };
}

export async function completePassengerOnboarding(
  userId: string,
  paymentMethod: PaymentMethod,
  avatarUri?: string | null,
  mimeType?: string,
) {
  let avatarUrl: string | null | undefined;
  if (avatarUri) {
    const upload = await uploadImage('profile-media', userId, 'avatar', avatarUri, mimeType);
    if (upload.error || !upload.path) return { error: upload.error ?? 'No pudimos guardar tu foto.' };
    avatarUrl = supabase.storage.from('profile-media').getPublicUrl(upload.path).data.publicUrl;
  }

  const payload: Record<string, unknown> = {
    onboarding_completed: true,
    default_payment_method: paymentMethod,
  };
  if (avatarUrl) payload.avatar_url = avatarUrl;
  const result = await supabase.from('profiles').update(payload).eq('id', userId);
  return { error: result.error?.message ?? null };
}

export async function getDriverOnboardingState(userId: string) {
  const [driverResult, driverDocsResult, vehicleResult, acceptanceResult, activationResult] = await Promise.all([
    supabase
      .from('drivers')
      .select('approval_status,onboarding_step,review_notes')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('driver_documents')
      .select('id,doc_type,status,storage_path,review_notes')
      .eq('driver_id', userId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id')
      .eq('driver_id', userId)
      .maybeSingle(),
    supabase
      .from('driver_agreement_acceptances')
      .select('agreement_key')
      .eq('driver_id', userId),
    supabase
      .from('driver_activation_codes')
      .select('code,expires_at,activated_at')
      .eq('driver_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let vehicleDocuments: OnboardingDocument[] = [];
  if (!vehicleResult.error && vehicleResult.data?.id) {
    const vehicleDocsResult = await supabase
      .from('vehicle_documents')
      .select('id,doc_type,status,storage_path,review_notes')
      .eq('vehicle_id', vehicleResult.data.id)
      .order('updated_at', { ascending: false });
    if (vehicleDocsResult.error) {
      return { data: null, error: errorMessage(vehicleDocsResult.error, 'No pudimos cargar los documentos del vehículo.') };
    }
    vehicleDocuments = (vehicleDocsResult.data ?? []) as OnboardingDocument[];
  }

  const firstError = driverResult.error ?? driverDocsResult.error ?? vehicleResult.error
    ?? acceptanceResult.error ?? activationResult.error;
  if (firstError) {
    return { data: null, error: errorMessage(firstError, 'No pudimos cargar tu registro de conductor.') };
  }

  return {
    data: {
      approvalStatus: driverResult.data?.approval_status ?? 'pending_documents',
      onboardingStep: Number(driverResult.data?.onboarding_step ?? 0),
      reviewNotes: driverResult.data?.review_notes ?? null,
      vehicleId: vehicleResult.data?.id ?? null,
      driverDocuments: (driverDocsResult.data ?? []) as OnboardingDocument[],
      vehicleDocuments,
      acceptedAgreementKeys: (acceptanceResult.data ?? []).map((item) => item.agreement_key),
      activationCode: activationResult.data?.code ?? null,
      activationExpiresAt: activationResult.data?.expires_at ?? null,
      activatedAt: activationResult.data?.activated_at ?? null,
    } satisfies DriverOnboardingState,
    error: null,
  };
}

export async function getVehicleOnboardingDocuments(vehicleId: string) {
  const result = await supabase
    .from('vehicle_documents')
    .select('id,doc_type,status,storage_path,review_notes')
    .eq('vehicle_id', vehicleId)
    .order('updated_at', { ascending: false });
  return {
    data: (result.data ?? []) as OnboardingDocument[],
    error: result.error?.message ?? null,
  };
}

export async function saveDriverOnboardingStep(userId: string, step: number) {
  const result = await supabase.from('drivers').update({ onboarding_step: step }).eq('id', userId);
  return { error: result.error?.message ?? null };
}

export async function uploadDriverOnboardingDocument(
  userId: string,
  table: OnboardingDocumentTable,
  docType: string,
  uri: string,
  mimeType = 'image/jpeg',
  vehicleId?: string | null,
) {
  const upload = await uploadImage('driver-documents', userId, docType, uri, mimeType);
  if (upload.error || !upload.path) return { error: upload.error ?? 'No pudimos guardar el documento.' };

  if (table === 'driver') {
    const result = await supabase.from('driver_documents').insert({
      driver_id: userId,
      doc_type: docType,
      storage_path: upload.path,
      status: 'submitted',
    });
    return { error: result.error?.message ?? null };
  }

  if (!vehicleId) return { error: 'Guarda primero los datos del vehículo.' };
  const result = await supabase.from('vehicle_documents').insert({
    vehicle_id: vehicleId,
    doc_type: docType,
    storage_path: upload.path,
    status: 'submitted',
  });
  return { error: result.error?.message ?? null };
}

export async function saveDriverVehicle(
  userId: string,
  vehicle: {
    make: string;
    model: string;
    year: string;
    color: string;
    plate: string;
    vin: string;
    seats: string;
  },
) {
  const payload = {
    driver_id: userId,
    make: vehicle.make.trim(),
    model: vehicle.model.trim(),
    year: Number(vehicle.year),
    color: vehicle.color.trim(),
    plate: vehicle.plate.trim().toUpperCase(),
    vin: vehicle.vin.trim().toUpperCase(),
    seat_capacity: Number(vehicle.seats),
  };
  const existing = await supabase.from('vehicles').select('id').eq('driver_id', userId).maybeSingle();
  if (existing.error) return { vehicleId: null, error: existing.error.message };
  const result = existing.data?.id
    ? await supabase.from('vehicles').update(payload).eq('id', existing.data.id).select('id').single()
    : await supabase.from('vehicles').insert(payload).select('id').single();
  return { vehicleId: result.data?.id ?? null, error: result.error?.message ?? null };
}

export async function getDriverVehicle(userId: string) {
  const result = await supabase
    .from('vehicles')
    .select('make,model,year,color,plate,vin,seat_capacity')
    .eq('driver_id', userId)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error.message };
  return {
    data: result.data
      ? {
          make: result.data.make ?? '',
          model: result.data.model ?? '',
          year: result.data.year ? String(result.data.year) : '',
          color: result.data.color ?? '',
          plate: result.data.plate ?? '',
          vin: result.data.vin ?? '',
          seats: result.data.seat_capacity ? String(result.data.seat_capacity) : '4',
        }
      : null,
    error: null,
  };
}

export async function acceptDriverAgreement(userId: string, agreementKey: string) {
  const userAgent = `Dame Pon Expo/${Platform.OS}`;
  const result = await supabase.rpc('accept_driver_agreement', {
    p_agreement_key: agreementKey,
    p_version: AGREEMENT_VERSION,
    p_user_agent: userAgent,
  });
  return { error: result.error?.message ?? null };
}

export async function activateDriverWithCode(code: string) {
  const result = await supabase.rpc('activate_driver_with_code', { p_code: code.trim() });
  return { error: result.error?.message ?? null };
}

export async function ensureDriverActivationCode() {
  const result = await supabase.rpc('issue_driver_activation_code');
  return { code: result.data?.code ?? null, error: result.error?.message ?? null };
}

export function isDriverDocumentsComplete(state: DriverOnboardingState) {
  const driverTypes = [
    'photo',
    'license_front',
    'ntsp_certificate_1',
    'ntsp_certificate_2',
    'conduct_certificate_1',
    'conduct_certificate_2',
  ];
  const vehicleTypes = [
    'registration',
    'insurance',
    'vehicle_front',
    'vehicle_rear',
    'vehicle_left',
    'vehicle_right',
    'vehicle_interior',
    'vin',
    'door_label',
    'inspection',
  ];
  return driverTypes.every((type) => state.driverDocuments.some((doc) => doc.doc_type === type && doc.status !== 'rejected'))
    && vehicleTypes.every((type) => state.vehicleDocuments.some((doc) => doc.doc_type === type && doc.status !== 'rejected'));
}

export { AGREEMENT_VERSION };