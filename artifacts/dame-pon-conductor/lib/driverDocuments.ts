import { supabase } from '@workspace/dame-pon-shared/lib/supabase';

export type DriverDocumentKind = 'profile_photo' | 'license_front' | 'registration' | 'insurance' | 'vehicle_photo';
export type ReviewStatus = 'pending_documents' | 'pending_review' | 'approved' | 'suspended' | 'offboarded';
export type DocumentStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired';

export interface DriverDocumentRecord {
  id: string;
  doc_type: string;
  status: DocumentStatus;
  review_notes: string | null;
  storage_path: string;
  updated_at: string;
}

export interface DriverDocumentReview {
  approvalStatus: ReviewStatus;
  driverReviewNotes: string | null;
  vehicleId: string | null;
  driverDocuments: DriverDocumentRecord[];
  vehicleDocuments: DriverDocumentRecord[];
}

const driverTypeForKind: Partial<Record<DriverDocumentKind, string>> = {
  profile_photo: 'photo',
  license_front: 'license_front',
};

const vehicleTypeForKind: Partial<Record<DriverDocumentKind, string>> = {
  registration: 'registration',
  insurance: 'insurance',
  vehicle_photo: 'photo',
};

export const REQUIRED_DRIVER_DOCUMENTS: Array<{ kind: DriverDocumentKind; label: string; table: 'driver' | 'vehicle' }> = [
  { kind: 'profile_photo', label: 'Foto de perfil', table: 'driver' },
  { kind: 'license_front', label: 'Licencia frontal', table: 'driver' },
  { kind: 'registration', label: 'Registro del vehículo', table: 'vehicle' },
  { kind: 'insurance', label: 'Seguro del vehículo', table: 'vehicle' },
  { kind: 'vehicle_photo', label: 'Foto del carro con tablilla', table: 'vehicle' },
];

const documentColumns = 'id,doc_type,status,review_notes,storage_path,updated_at';

function serviceError(error: { message?: string }) {
  return error.message ?? 'No pudimos consultar tus documentos.';
}

export async function getDriverDocumentReview(userId: string): Promise<{ data: DriverDocumentReview | null; error: string | null }> {
  const [driverResult, driverDocumentsResult, vehicleResult] = await Promise.all([
    supabase.from('drivers').select('approval_status,review_notes').eq('id', userId).maybeSingle(),
    supabase.from('driver_documents').select(documentColumns).eq('driver_id', userId).order('updated_at', { ascending: false }),
    supabase.from('vehicles').select('id').eq('driver_id', userId).maybeSingle(),
  ]);

  if (driverResult.error) return { data: null, error: serviceError(driverResult.error) };
  if (driverDocumentsResult.error) return { data: null, error: serviceError(driverDocumentsResult.error) };
  if (vehicleResult.error) return { data: null, error: serviceError(vehicleResult.error) };

  const vehicleId = vehicleResult.data?.id ?? null;
  let vehicleDocuments: DriverDocumentRecord[] = [];
  if (vehicleId) {
    const result = await supabase
      .from('vehicle_documents')
      .select(documentColumns)
      .eq('vehicle_id', vehicleId)
      .order('updated_at', { ascending: false });
    if (result.error) return { data: null, error: serviceError(result.error) };
    vehicleDocuments = (result.data ?? []) as DriverDocumentRecord[];
  }

  return {
    data: {
      approvalStatus: (driverResult.data?.approval_status ?? 'pending_documents') as ReviewStatus,
      driverReviewNotes: driverResult.data?.review_notes ?? null,
      vehicleId,
      driverDocuments: (driverDocumentsResult.data ?? []) as DriverDocumentRecord[],
      vehicleDocuments,
    },
    error: null,
  };
}

export async function uploadDriverDocument(
  userId: string,
  kind: DriverDocumentKind,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<{ error: string | null }> {
  const response = await fetch(uri);
  if (!response.ok) return { error: 'No pudimos leer la imagen seleccionada.' };
  const body = await response.arrayBuffer();
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const storagePath = `${userId}/${kind}-${Date.now()}.${extension}`;

  const upload = await supabase.storage.from('driver-documents').upload(storagePath, body, {
    contentType: mimeType,
    upsert: false,
  });
  if (upload.error) return { error: upload.error.message };

  const driverType = driverTypeForKind[kind];
  if (driverType) {
    const result = await supabase.from('driver_documents').insert({
      driver_id: userId,
      doc_type: driverType,
      storage_path: storagePath,
      status: 'submitted',
    });
    if (result.error) return { error: result.error.message };
    return { error: null };
  }

  const vehicleId = await supabase.from('vehicles').select('id').eq('driver_id', userId).maybeSingle();
  if (vehicleId.error || !vehicleId.data?.id) {
    return { error: vehicleId.error?.message ?? 'Guarda primero los datos del vehículo.' };
  }
  const vehicleType = vehicleTypeForKind[kind];
  const result = await supabase.from('vehicle_documents').insert({
    vehicle_id: vehicleId.data.id,
    doc_type: vehicleType,
    storage_path: storagePath,
    status: 'submitted',
  });
  return { error: result.error?.message ?? null };
}

export function latestDocument(documents: DriverDocumentRecord[], docType: string) {
  return documents.find((document) => document.doc_type === docType) ?? null;
}

export function reviewIsComplete(review: DriverDocumentReview | null) {
  if (!review || review.approvalStatus !== 'approved') return false;
  return REQUIRED_DRIVER_DOCUMENTS.every(({ kind }) => {
    const source = driverTypeForKind[kind] ? review.driverDocuments : review.vehicleDocuments;
    const docType = driverTypeForKind[kind] ?? vehicleTypeForKind[kind];
    return Boolean(docType && latestDocument(source, docType)?.status === 'approved');
  });
}