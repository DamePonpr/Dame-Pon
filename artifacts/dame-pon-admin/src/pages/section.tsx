import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, History, Inbox, Lock, RefreshCw, UserRound } from 'lucide-react';
import {
  getGetAdminDetailQueryKey,
  getGetAdminRecordsQueryKey,
  useGetAdminDetail,
  useGetAdminRecords,
  type AdminActionInputAction,
  type AdminDocument,
  type AdminRecord,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shell';
import { EmptyState, InlineError, SkeletonRows, StatusPill } from '@/components/admin-ui';
import { ActionDialog, OpenDocumentDialog, docTypeLabel } from '@/components/action-dialog';
import { ACTION_LABELS, DESTRUCTIVE_ACTIONS, errorMessage, errorStatus, formatDate, formatDateTime, shortId, statusLabel, type ActionTarget, type SectionMeta } from '@/lib/admin';
import { liveQuery } from '@/lib/live';
import { cn } from '@/lib/utils';

const LIMIT = 25;

export default function SectionPage({ meta }: { meta: SectionMeta }) {
  const params = useParams<{ id?: string }>();
  const selectedId = params.id ? decodeURIComponent(params.id) : null;
  const [offset, setOffset] = useState(0);
  const q = useGetAdminRecords(
    { section: meta.key, offset, limit: LIMIT },
    { query: { ...liveQuery(), queryKey: getGetAdminRecordsQueryKey({ section: meta.key, offset, limit: LIMIT }), placeholderData: (prev) => prev } },
  );
  const total = q.data?.total ?? 0;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader
        eyebrow={meta.readOnly ? `${meta.label} · solo lectura` : meta.label}
        title={meta.label}
        body={meta.blurb}
        right={
          <Button data-testid="button-refresh-list" size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn('size-3.5', q.isFetching && 'animate-spin')} /> Actualizar
          </Button>
        }
      />
      {meta.key === 'pricing' && (
        <div className="stripe-tape flex items-center gap-2 border-b border-[hsl(14_60%_80%)] px-5 py-2.5 text-sm font-medium text-[hsl(14_70%_30%)] sm:px-8">
          <Lock className="size-4" /> Reglas anteriores o no aprobadas. Este panel no puede crear, aprobar ni editar tarifas.
        </div>
      )}
      <div className="grid flex-1 xl:grid-cols-[minmax(340px,440px)_1fr]">
        <section className={cn('border-border bg-card xl:border-r', selectedId && 'hidden xl:block')}>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span data-testid="text-total">{q.data ? `${total} registro${total === 1 ? '' : 's'}` : 'Cargando…'}</span>
            {q.data && total > LIMIT && (
              <div className="flex items-center gap-1">
                <span className="font-mono">{offset + 1}–{Math.min(offset + LIMIT, total)}</span>
                <Button data-testid="button-prev-page" size="icon" variant="ghost" className="size-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft className="size-4" /></Button>
                <Button data-testid="button-next-page" size="icon" variant="ghost" className="size-7" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}><ChevronRight className="size-4" /></Button>
              </div>
            )}
          </div>
          {q.isLoading ? (
            <SkeletonRows />
          ) : q.isError ? (
            <InlineError message={errorMessage(q.error)} onRetry={() => void q.refetch()} retrying={q.isFetching} />
          ) : q.data && q.data.items.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title="Nada en cola" body={`No hay ${meta.label.toLowerCase()} que mostrar en este momento.`} />
          ) : (
            <ul className="divide-y divide-border">
              {q.data?.items.map((r, i) => <RecordRow key={r.id} r={r} meta={meta} selected={r.id === selectedId} index={i} />)}
            </ul>
          )}
        </section>
        <section className={cn('min-w-0', !selectedId && 'hidden xl:block')}>
          {selectedId ? (
            <DetailPane key={`${meta.key}:${selectedId}`} meta={meta} id={selectedId} />
          ) : (
            <div className="grid h-full place-items-center p-10">
              <EmptyState icon={<FileText className="size-5" />} title={`Selecciona un ${meta.singular.toLowerCase()}`} body="El detalle, los documentos y la bitácora aparecerán aquí." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordRow({ r, meta, selected, index }: { r: AdminRecord; meta: SectionMeta; selected: boolean; index: number }) {
  return (
    <li>
      <Link
        href={`${meta.path}/${encodeURIComponent(r.id)}`}
        data-testid={`row-record-${r.id}`}
        className={cn('rise relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/60', selected && 'bg-accent/60 hover:bg-accent/70')}
        style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
      >
        {selected && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[hsl(14_88%_60%)]" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.secondary ?? <span className="font-mono">{shortId(r.id)}</span>}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusPill status={r.status} />
          {r.assigneeId && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><UserRound className="size-3" /> asignado</span>}
        </div>
      </Link>
    </li>
  );
}

function DetailPane({ meta, id }: { meta: SectionMeta; id: string }) {
  const q = useGetAdminDetail(meta.key, id, { query: { ...liveQuery(), queryKey: getGetAdminDetailQueryKey(meta.key, id) } });
  const [action, setAction] = useState<AdminActionInputAction | null>(null);
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [doc, setDoc] = useState<AdminDocument | null>(null);

  const back = (
    <Link href={meta.path} data-testid="link-back" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:hidden">
      <ArrowLeft className="size-4" /> {meta.label}
    </Link>
  );

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        {back}
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-4">
        {back}
        {errorStatus(q.error) === 404 ? (
          <EmptyState icon={<Inbox className="size-5" />} title="Registro no encontrado" body="Puede que ya no exista o que hayas seguido un enlace antiguo." />
        ) : (
          <InlineError message={errorMessage(q.error)} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )}
      </div>
    );
  }

  const { record, documents, events } = q.data;
  const meta2 = Object.entries(record.metadata ?? {});
  const actionSection = meta.key as ActionTarget['section'];
  const openAction = (a: AdminActionInputAction, t: ActionTarget) => {
    setTarget(t);
    setAction(a);
  };

  return (
    <div className="rise space-y-6 p-5 sm:p-8" data-testid="panel-detail">
      {back}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{meta.singular} · {shortId(record.id)} · rev {record.revision}</p>
          <h2 data-testid="text-record-title" className="font-display mt-1 break-words text-3xl font-bold">{record.title}</h2>
          {record.secondary && <p className="mt-1 text-sm text-muted-foreground">{record.secondary}</p>}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {q.isFetching && <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />}
          <StatusPill status={record.status} className="text-xs" />
        </div>
      </div>

      {!meta.readOnly && meta.actions.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acciones disponibles</p>
          <div className="flex flex-wrap gap-2">
            {meta.actions.map((a) => (
              <Button
                key={a}
                data-testid={`button-action-${a}`}
                size="sm"
                variant={a === 'approve' || a === 'activate' || a === 'resolve' ? 'default' : DESTRUCTIVE_ACTIONS.includes(a) ? 'outline' : 'secondary'}
                className={cn(DESTRUCTIVE_ACTIONS.includes(a) && 'border-[hsl(356_60%_80%)] text-[hsl(356_60%_38%)] hover:bg-[hsl(356_80%_96%)]')}
                onClick={() => openAction(a, { section: actionSection, recordId: record.id, revision: record.revision, label: record.title })}
              >
                {ACTION_LABELS[a]}
              </Button>
            ))}
          </div>
          {meta.key === 'drivers' && <p className="mt-3 text-xs text-muted-foreground">La aprobación puede rechazarse si faltan documentos aprobados, el acuerdo firmado o un vehículo activo.</p>}
        </div>
      )}
      {meta.readOnly && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> Consulta sin acciones. Ningún cambio se puede hacer desde este panel.</p>
      )}

      {meta2.length > 0 && (
        <dl className="grid gap-px overflow-hidden rounded-xl border border-card-border bg-border sm:grid-cols-2">
          {meta2.map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, ' ')}</dt>
              <dd data-testid={`text-meta-${k}`} className="mt-0.5 break-words text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {meta.hasDocuments && (
        <div>
          <h3 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><FileText className="size-4" /> Documentos</h3>
          {documents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No hay documentos registrados para este {meta.singular.toLowerCase()}.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card">
              {documents.map((d) => {
                const expired = d.expiresOn ? new Date(d.expiresOn).getTime() < Date.now() : false;
                const t: ActionTarget = { section: 'documents', recordId: d.id, revision: d.revision, label: docTypeLabel(d.type), documentKind: d.kind };
                return (
                  <li key={d.id} data-testid={`row-document-${d.id}`} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium capitalize">{docTypeLabel(d.type)}</p>
                      <p className={cn('text-xs', expired ? 'text-destructive' : 'text-muted-foreground')}>
                        {d.kind === 'driver' ? 'Conductor' : 'Vehículo'} · rev {d.revision} · {d.expiresOn ? `${expired ? 'venció' : 'vence'} ${formatDate(d.expiresOn)}` : 'sin vencimiento'}
                      </p>
                    </div>
                    <StatusPill status={d.status} />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" data-testid={`button-open-document-${d.id}`} onClick={() => setDoc(d)}><Lock className="size-3.5" /> Abrir</Button>
                      <Button size="sm" variant="secondary" data-testid={`button-approve-document-${d.id}`} onClick={() => openAction('approve', t)}>Aprobar</Button>
                      <Button size="sm" variant="ghost" className="text-[hsl(356_60%_38%)]" data-testid={`button-reject-document-${d.id}`} onClick={() => openAction('reject', t)}>Rechazar</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div>
        <h3 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><History className="size-4" /> Bitácora</h3>
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Sin eventos de auditoría todavía.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((e) => (
              <li key={e.id} data-testid={`event-${e.id}`} className="relative">
                <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-[hsl(14_88%_60%)]" />
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{ACTION_LABELS[e.action as AdminActionInputAction] ?? e.action}</span>
                  {e.fromStatus && e.toStatus && <span className="text-xs text-muted-foreground">{statusLabel(e.fromStatus)} → {statusLabel(e.toStatus)}</span>}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground/85">{e.reason}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">por {shortId(e.actorId)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ActionDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) { setAction(null); setTarget(null); } }}
        action={action}
        target={target}
        listSection={meta.key}
        detailId={id}
      />
      <OpenDocumentDialog open={doc !== null} onOpenChange={(o) => !o && setDoc(null)} doc={doc} />
    </div>
  );
}
