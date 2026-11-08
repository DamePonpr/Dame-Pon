import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { statusLabel, statusTone, type Tone } from '@/lib/admin';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const MARK_NAVY = `${base}/dame-pon-mark-navy.png`;
export const MARK_WHITE = `${base}/dame-pon-mark-white.png`;

const TONES: Record<Tone, string> = {
  good: 'bg-[hsl(168_45%_92%)] text-[hsl(168_60%_24%)] ring-[hsl(168_40%_78%)]',
  warn: 'bg-[hsl(40_95%_92%)] text-[hsl(30_75%_30%)] ring-[hsl(40_80%_76%)]',
  bad: 'bg-[hsl(356_80%_95%)] text-[hsl(356_65%_38%)] ring-[hsl(356_60%_84%)]',
  neutral: 'bg-secondary text-muted-foreground ring-border',
  info: 'bg-[hsl(214_70%_94%)] text-[hsl(220_62%_28%)] ring-[hsl(214_50%_82%)]',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      data-testid={`status-${status}`}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {statusLabel(status)}
    </span>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 80}ms` }} />
          <div className="h-3.5 w-1/5 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 80}ms` }} />
          <div className="ml-auto h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function InlineError({ message, onRetry, retrying }: { message: string; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div data-testid="state-error" className="m-4 flex flex-col gap-3 rounded-lg border border-[hsl(356_60%_84%)] bg-[hsl(356_80%_97%)] p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="size-5 shrink-0 text-destructive" />
      <p className="text-sm text-[hsl(356_55%_30%)]">{message}</p>
      {onRetry && (
        <Button data-testid="button-retry" size="sm" variant="outline" className="sm:ml-auto" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn('size-3.5', retrying && 'animate-spin')} /> Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div data-testid="state-empty" className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">{icon}</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function FullScreen({ eyebrow, title, children, tone = 'navy' }: { eyebrow: string; title: string; children: ReactNode; tone?: 'navy' | 'tape' }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-[hsl(14_88%_60%/0.12)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-52 -left-32 size-[460px] rounded-full bg-[hsl(205_80%_55%/0.10)] blur-3xl" />
      {tone === 'tape' && <div className="stripe-tape absolute inset-x-0 top-0 h-2" />}
      <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center gap-3">
          <img src={MARK_WHITE} alt="Dame Pon" className="h-8 w-auto" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/60">Administración</span>
        </header>
        <main className="rise flex flex-1 flex-col justify-center py-12">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-sidebar-primary">{eyebrow}</p>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-[1.05] text-sidebar-accent-foreground sm:text-6xl">{title}</h1>
          <div className="mt-8 max-w-xl">{children}</div>
        </main>
        <footer className="text-xs text-sidebar-foreground/50">Acceso restringido. Toda acción queda registrada con su razón y autor.</footer>
      </div>
    </div>
  );
}

export function SessionCheck({ label }: { label: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-sidebar" data-testid="state-loading">
      <div className="flex flex-col items-center gap-5">
        <img src={MARK_WHITE} alt="Dame Pon" className="h-10 w-auto animate-pulse" />
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-sidebar-foreground/60">{label}</p>
      </div>
    </div>
  );
}
