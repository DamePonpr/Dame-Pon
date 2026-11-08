import type {
  AdminActionInputAction,
  AdminActionInputSection,
  AdminSection,
} from '@workspace/api-client-react';

export function errorStatus(e: unknown): number {
  if (e && typeof e === 'object' && 'status' in e) {
    const n = Number((e as { status: unknown }).status);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isAuthError(e: unknown): boolean {
  const s = errorStatus(e);
  return s === 401 || s === 403;
}
export function adminSessionMatches(session:{actorId:string;role:string;schemaVersion:string}|undefined,identity:string|null):boolean {
  return !!identity&&session?.actorId===identity&&session.role==='admin'&&session.schemaVersion==='phase5-v1';
}

export function errorCode(e: unknown): string | null {
  if (e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data: unknown }).data;
    if (d && typeof d === 'object' && 'code' in d) return String((d as { code: unknown }).code);
  }
  return null;
}

const CODE_MESSAGES: Record<string, string> = {
  missing_documents: 'Faltan documentos aprobados para completar esta acción.',
  missing_agreement: 'El conductor no ha aceptado el acuerdo vigente.',
  no_active_vehicle: 'El conductor no tiene un vehículo activo.',
  busy_trip: 'Hay un viaje en curso asociado. Inténtalo cuando termine.',
  revision_conflict: 'Otra persona modificó este registro. Recargamos la versión actual.',
  invalid_transition: 'La transición no es válida desde el estado actual.',
};

export function errorMessage(e: unknown): string {
  const code = errorCode(e);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (e && typeof e === 'object' && 'data' in e) {
    const d = (e as { data: unknown }).data;
    if (d && typeof d === 'object' && 'error' in d) {
      const msg = String((d as { error: unknown }).error);
      if (msg) return msg;
    }
  }
  const s = errorStatus(e);
  if (s === 0) return 'Sin conexión con el servidor. Verifica tu red e inténtalo de nuevo.';
  if (s === 401) return 'Tu sesión expiró. Inicia sesión de nuevo.';
  if (s === 403) return 'Tu cuenta no tiene permiso para esta operación.';
  if (s === 404) return 'El registro no existe o ya no está disponible.';
  if (s === 409) return 'El registro cambió mientras trabajabas. Revisa la versión actual.';
  if (s === 503) return 'El servicio de administración no está disponible ahora mismo.';
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export const REASON_MIN = 10;
export const REASON_MAX = 1000;

export type SectionMeta = {
  key: AdminSection;
  path: string;
  label: string;
  singular: string;
  blurb: string;
  readOnly: boolean;
  hasDocuments: boolean;
  actions: AdminActionInputAction[];
};

export const SECTIONS: SectionMeta[] = [
  { key: 'drivers', path: '/drivers', label: 'Conductores', singular: 'Conductor', blurb: 'Solicitudes pendientes, documentos y estado de cada conductor.', readOnly: false, hasDocuments: true, actions: ['approve', 'reject', 'suspend'] },
  { key: 'vehicles', path: '/vehicles', label: 'Vehículos', singular: 'Vehículo', blurb: 'Flota registrada, documentos y disponibilidad operacional.', readOnly: false, hasDocuments: true, actions: ['activate', 'out_of_service', 'retire'] },
  { key: 'incidents', path: '/incidents', label: 'Incidentes', singular: 'Incidente', blurb: 'Reportes de seguridad: clasificar, revisar, resolver y asignar.', readOnly: false, hasDocuments: false, actions: ['triage', 'review', 'resolve', 'close', 'reopen', 'assign'] },
  { key: 'support', path: '/support', label: 'Soporte', singular: 'Caso', blurb: 'Casos de pasajeros y conductores en espera de respuesta.', readOnly: false, hasDocuments: false, actions: ['resolve', 'close', 'reopen', 'assign'] },
  { key: 'trips', path: '/trips', label: 'Viajes', singular: 'Viaje', blurb: 'Consulta mínima de viajes. Sin acciones desde este panel.', readOnly: true, hasDocuments: false, actions: [] },
  { key: 'pricing', path: '/pricing', label: 'Tarifas', singular: 'Regla', blurb: 'Reglas anteriores y no aprobadas, estado de cotización. Solo lectura.', readOnly: true, hasDocuments: false, actions: [] },
];

export const ACTION_LABELS: Record<AdminActionInputAction, string> = {
  approve: 'Aprobar',
  reject: 'Rechazar',
  suspend: 'Suspender',
  activate: 'Activar',
  out_of_service: 'Fuera de servicio',
  retire: 'Retirar',
  triage: 'Clasificar',
  review: 'Pasar a revisión',
  resolve: 'Resolver',
  close: 'Cerrar',
  reopen: 'Reabrir',
  assign: 'Asignar',
};

export const DESTRUCTIVE_ACTIONS: AdminActionInputAction[] = ['reject', 'suspend', 'retire', 'out_of_service'];

export type ActionTarget = {
  section: AdminActionInputSection;
  recordId: string;
  revision: number;
  label: string;
  documentKind?: 'driver' | 'vehicle';
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', pending_documents:'Documentos pendientes', pending_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado',
  suspended: 'Suspendido', active: 'Activo', inactive: 'Inactivo', out_of_service: 'Fuera de servicio',
  retired: 'Retirado', open: 'Abierto', triaged: 'Clasificado', under_review:'En revisión', pending_customer:'Espera respuesta', in_review: 'En revisión', reviewing: 'En revisión',
  resolved: 'Resuelto', closed: 'Cerrado', reopened: 'Reabierto', expired: 'Vencido', draft: 'Borrador',
  unapproved: 'No aprobada', superseded: 'Reemplazada', completed: 'Completado', cancelled: 'Cancelado',
  requested: 'Solicitado', accepted: 'Aceptado', in_progress: 'En curso',
};

export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/_/g, ' ');
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';
export function statusTone(s: string): Tone {
  if (['approved', 'active', 'resolved', 'completed'].includes(s)) return 'good';
  if (['pending', 'pending_review', 'open', 'reopened', 'triaged', 'in_review', 'reviewing', 'requested', 'in_progress', 'accepted'].includes(s)) return 'warn';
  if (['rejected', 'suspended', 'out_of_service', 'expired', 'unapproved'].includes(s)) return 'bad';
  if (['closed', 'retired', 'superseded', 'cancelled', 'inactive', 'draft'].includes(s)) return 'neutral';
  return 'info';
}

export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('es-PR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Puerto_Rico' });
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('es-PR', { dateStyle: 'medium', timeZone: 'America/Puerto_Rico' });
}

export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export const POLL_MS = 30_000;
