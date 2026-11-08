import { Link } from 'wouter';
import { ArrowUpRight, CircleHelp, Route as RouteIcon, ShieldAlert, UserCheck } from 'lucide-react';
import { getGetAdminOverviewQueryKey, useGetAdminOverview } from '@workspace/api-client-react';
import { PageHeader } from '@/components/shell';
import { InlineError } from '@/components/admin-ui';
import { errorMessage, formatDateTime } from '@/lib/admin';
import { liveQuery } from '@/lib/live';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const q = useGetAdminOverview({ query: { ...liveQuery(), queryKey: getGetAdminOverviewQueryKey() } });
  const cards = [
    { key: 'driversPending', label: 'Conductores por revisar', href: '/drivers', icon: UserCheck, accent: true },
    { key: 'incidentsOpen', label: 'Incidentes abiertos', href: '/incidents', icon: ShieldAlert, accent: true },
    { key: 'supportOpen', label: 'Casos de soporte abiertos', href: '/support', icon: CircleHelp, accent: false },
    { key: 'tripsActive', label: 'Viajes activos', href: '/trips', icon: RouteIcon, accent: false },
  ] as const;

  return (
    <div>
      <PageHeader
        eyebrow="Resumen"
        title="Lo que espera decisión"
        body="Conteos en vivo desde el servidor. Se actualizan cada 30 segundos y al volver a esta pestaña."
        right={q.data && <p data-testid="text-asof" className="font-mono text-xs text-muted-foreground">Corte: {formatDateTime(q.data.asOf)}</p>}
      />
      {q.isError ? (
        <InlineError message={errorMessage(q.error)} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <div className="grid gap-px overflow-hidden border-b border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ key, label, href, icon: Icon, accent }, i) => {
            const value = q.data?.[key];
            return (
              <Link
                key={key}
                href={href}
                data-testid={`card-${key}`}
                className="rise group relative flex flex-col bg-card px-6 py-7 transition-colors hover:bg-secondary/60"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className={cn('size-4', accent && value ? 'text-[hsl(14_80%_52%)]' : '')} /> {label}
                  <ArrowUpRight className="ml-auto size-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                {q.isLoading || value === undefined ? (
                  <div className="mt-4 h-12 w-20 animate-pulse rounded bg-muted" />
                ) : (
                  <p data-testid={`text-${key}`} className={cn('font-display mt-3 text-6xl font-bold tabular-nums', accent && value > 0 ? 'text-[hsl(14_78%_50%)]' : 'text-foreground')}>
                    {value}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <section className="grid gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="font-display text-xl font-bold">Cómo trabaja esta mesa</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            {[
              'Cada cambio de estado exige una razón de al menos 10 caracteres y una confirmación explícita.',
              'Los documentos privados solo muestran metadatos. Abrirlos requiere justificar el acceso; el enlace dura un minuto.',
              'Si otra persona cambió el registro antes que tú, el servidor lo rechaza y verás la versión actual.',
              'Nada se borra. Todo queda en la bitácora con autor, hora y estados.',
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs text-[hsl(14_75%_50%)]">0{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="stripe-tape rounded-xl border border-[hsl(14_60%_80%)] p-6">
          <h2 className="font-display text-xl font-bold">Tarifas en solo lectura</h2>
          <p className="mt-2 text-sm text-muted-foreground">Las reglas de precio anteriores o no aprobadas se pueden consultar, pero no modificar desde aquí.</p>
          <Link href="/pricing" data-testid="link-pricing" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Ver reglas <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
