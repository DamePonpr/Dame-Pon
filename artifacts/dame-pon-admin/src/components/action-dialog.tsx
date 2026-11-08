import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileLock2, Loader2, ShieldCheck } from 'lucide-react';
import {
  getGetAdminDetailQueryKey,
  getGetAdminOverviewQueryKey,
  getGetAdminRecordsQueryKey,
  getGetAdminSessionQueryKey,
  useGetAdminAssignees,
  getGetAdminAssigneesQueryKey,
  useOpenAdminDocument,
  useRunAdminAction,
  type AdminActionInputAction,
  type AdminDocument,
  type AdminSection,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ACTION_LABELS,
  DESTRUCTIVE_ACTIONS,
  REASON_MAX,
  REASON_MIN,
  errorMessage,
  errorStatus,
  isAuthError,
  newIdempotencyKey,
  type ActionTarget,
} from '@/lib/admin';

function ReasonField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const len = value.trim().length;
  const ok = len >= REASON_MIN && len <= REASON_MAX;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Razón (queda en la bitácora de auditoría)</Label>
      <Textarea
        id={id}
        data-testid="input-reason"
        value={value}
        maxLength={REASON_MAX + 50}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Describe qué verificaste y por qué tomas esta decisión."
        className="resize-none"
      />
      <p className={cn('text-right font-mono text-[11px]', ok || len === 0 ? 'text-muted-foreground' : 'text-destructive')}>
        {len} / {REASON_MAX} · mínimo {REASON_MIN}
      </p>
    </div>
  );
}

export function ActionDialog({
  open,
  onOpenChange,
  action,
  target,
  listSection,
  detailId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  action: AdminActionInputAction | null;
  target: ActionTarget | null;
  listSection: AdminSection;
  detailId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [assignee, setAssignee] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string>(newIdempotencyKey());
  const lastPayload = useRef<string>('');
  const mutation = useRunAdminAction();
  const isAssign = action === 'assign';
  const assignees = useGetAdminAssignees({ query: { enabled: open && isAssign, queryKey: getGetAdminAssigneesQueryKey(), retry: (n, e) => !isAuthError(e) && n < 2 } });

  useEffect(() => {
    if (open) {
      setReason('');
      setConfirmed(false);
      setAssignee('');
      setError(null);
      keyRef.current = newIdempotencyKey();
      lastPayload.current = '';
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, action, target?.recordId]);

  if (!action || !target) return null;
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;
  const assignOk = !isAssign || assignee !== '';
  const busy = mutation.isPending;
  const destructive = DESTRUCTIVE_ACTIONS.includes(action);

  const submit = () => {
    if (!reasonOk || !confirmed || !assignOk || busy) return;
    const assigneeId = isAssign ? (assignee === '__none' ? null : assignee) : undefined;
    const payloadSig = JSON.stringify([action, target.recordId, target.revision, trimmed, assigneeId]);
    // Same payload after a network failure reuses the key; any change gets a fresh one.
    if (lastPayload.current && lastPayload.current !== payloadSig) keyRef.current = newIdempotencyKey();
    lastPayload.current = payloadSig;
    setError(null);
    mutation.mutate(
      {
        data: {
          section: target.section,
          recordId: target.recordId,
          action,
          reason: trimmed,
          expectedRevision: target.revision,
          idempotencyKey: keyRef.current,
          ...(target.documentKind ? { documentKind: target.documentKind } : {}),
          ...(isAssign ? { assigneeId } : {}),
        },
      },
      {
        onSuccess: (res) => {
          void qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetAdminRecordsQueryKey({ section: listSection }).slice(0, 1) });
          void qc.invalidateQueries({ queryKey: getGetAdminDetailQueryKey(listSection, detailId) });
          toast({ title: `${ACTION_LABELS[action]}: registrado`, description: `Auditoría ${res.auditId.slice(0, 8)} · ${target.label}` });
          onOpenChange(false);
        },
        onError: (e) => {
          setError(errorMessage(e));
          const s = errorStatus(e);
          if (isAuthError(e)) void qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
          if (s !== 0) {
            keyRef.current = newIdempotencyKey();
            lastPayload.current = '';
          }
          if (s === 409) {
            void qc.invalidateQueries({ queryKey: getGetAdminDetailQueryKey(listSection, detailId) });
            void qc.invalidateQueries({ queryKey: getGetAdminRecordsQueryKey({ section: listSection }).slice(0, 1) });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-action">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{ACTION_LABELS[action]}</DialogTitle>
          <DialogDescription>
            {target.label} · revisión <span className="font-mono">{target.revision}</span>. El servidor valida la transición; si el registro cambió, te mostraremos la versión actual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isAssign && (
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              {assignees.isLoading ? (
                <div className="h-9 animate-pulse rounded-md bg-muted" />
              ) : assignees.isError ? (
                <p className="text-sm text-destructive">{errorMessage(assignees.error)}</p>
              ) : (
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger data-testid="select-assignee">
                    <SelectValue placeholder="Selecciona una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin asignar (quitar responsable)</SelectItem>
                    {(assignees.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {assignees.data && assignees.data.length === 0 && <p className="text-xs text-muted-foreground">No hay personas disponibles para asignar.</p>}
            </div>
          )}
          <ReasonField id="action-reason" value={reason} onChange={setReason} />
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
            <Checkbox data-testid="checkbox-confirm" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} className="mt-0.5" />
            <span>Confirmo que revisé la evidencia y que esta acción quedará registrada a mi nombre.</span>
          </label>
          {error && <p data-testid="text-action-error" className="rounded-md bg-[hsl(356_80%_96%)] px-3 py-2 text-sm text-[hsl(356_60%_34%)]">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} data-testid="button-cancel-action">Cancelar</Button>
          <Button
            data-testid="button-confirm-action"
            variant={destructive ? 'destructive' : 'default'}
            onClick={submit}
            disabled={!reasonOk || !confirmed || !assignOk || busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? 'Enviando…' : error && errorStatus(mutation.error) === 0 ? 'Reintentar' : ACTION_LABELS[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DOC_TYPES: Record<string, string> = {
  license: 'Licencia de conducir', drivers_license: 'Licencia de conducir', registration: 'Registro (marbete)',
  insurance: 'Seguro', background_check: 'Certificado de antecedentes', photo: 'Foto', inspection: 'Inspección',
};
export const docTypeLabel = (t: string) => DOC_TYPES[t] ?? t.replace(/_/g, ' ');

export function OpenDocumentDialog({ doc, open, onOpenChange }: { doc: AdminDocument | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const keyRef = useRef(newIdempotencyKey());
  const lastPayload = useRef('');
  const mutation = useOpenAdminDocument();

  useEffect(() => {
    if (open) {
      setReason('');
      setConfirmed(false);
      setError(null);
      setLink(null);
      keyRef.current = newIdempotencyKey();
      lastPayload.current = '';
      mutation.reset();
    } else {
      setLink(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc?.id]);

  useEffect(() => {
    if (!link) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= link.expiresAt) {
        setLink(null);
        setError('El enlace temporal expiró. Solicita acceso de nuevo.');
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [link]);

  useEffect(() => () => setLink(null), []);

  if (!doc) return null;
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;
  const busy = mutation.isPending;
  const secondsLeft = link ? Math.max(0, Math.ceil((link.expiresAt - now) / 1000)) : 0;

  const submit = () => {
    if (!reasonOk || !confirmed || busy) return;
    const sig = JSON.stringify([doc.id, doc.revision, trimmed]);
    if (lastPayload.current && lastPayload.current !== sig) keyRef.current = newIdempotencyKey();
    lastPayload.current = sig;
    setError(null);
    mutation.mutate(
      { data: { id: doc.id, kind: doc.kind, reason: trimmed, expectedRevision: doc.revision, idempotencyKey: keyRef.current } },
      {
        onSuccess: (res) => {
          let safe = false;
          try {
            safe = new URL(res.url).protocol === 'https:';
          } catch {
            safe = false;
          }
          const exp = Date.parse(res.expiresAt);
          if (!safe || Number.isNaN(exp)) {
            setError('El servidor devolvió un enlace no válido. No se abrió el documento.');
            return;
          }
          setNow(Date.now());
          setLink({ url: res.url, expiresAt: Math.min(exp, Date.now() + 60_000) });
          keyRef.current = newIdempotencyKey();
          lastPayload.current = '';
        },
        onError: (e) => {
          setError(errorMessage(e));
          if (isAuthError(e)) void qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
          if (errorStatus(e) !== 0) {
            keyRef.current = newIdempotencyKey();
            lastPayload.current = '';
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-open-document">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-2xl"><FileLock2 className="size-5 text-[hsl(14_75%_50%)]" /> Abrir documento privado</DialogTitle>
          <DialogDescription>
            {docTypeLabel(doc.type)} · {doc.kind === 'driver' ? 'conductor' : 'vehículo'}. El acceso genera un enlace temporal de un minuto y queda auditado.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="rise space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-[hsl(168_40%_78%)] bg-[hsl(168_45%_95%)] p-3 text-sm text-[hsl(168_60%_22%)]">
              <ShieldCheck className="size-5" /> Acceso concedido. El enlace caduca en <span className="font-mono font-semibold">{secondsLeft}s</span>.
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full origin-left bg-[hsl(14_88%_60%)] transition-transform duration-500 ease-linear" style={{ transform: `scaleX(${secondsLeft / 60})` }} />
            </div>
            <a
              data-testid="link-open-document"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <ExternalLink className="size-4" /> Ver documento en pestaña nueva
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <ReasonField id="doc-reason" value={reason} onChange={setReason} />
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <Checkbox data-testid="checkbox-confirm-document" checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} className="mt-0.5" />
              <span>Necesito ver este documento para una revisión de seguridad en curso.</span>
            </label>
            {error && <p data-testid="text-document-error" className="rounded-md bg-[hsl(356_80%_96%)] px-3 py-2 text-sm text-[hsl(356_60%_34%)]">{error}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy} data-testid="button-close-document">{link ? 'Cerrar' : 'Cancelar'}</Button>
          {!link && (
            <Button data-testid="button-request-document" onClick={submit} disabled={!reasonOk || !confirmed || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {busy ? 'Solicitando…' : 'Solicitar acceso'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
