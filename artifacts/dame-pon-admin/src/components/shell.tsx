import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Car, CircleHelp, Gauge, LogOut, Route as RouteIcon, ShieldAlert, Tags, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortId } from '@/lib/admin';
import { MARK_WHITE } from '@/components/admin-ui';

const NAV = [
  { href: '/', label: 'Resumen', icon: Gauge },
  { href: '/drivers', label: 'Conductores', icon: UserCheck },
  { href: '/vehicles', label: 'Vehículos', icon: Car },
  { href: '/incidents', label: 'Incidentes', icon: ShieldAlert },
  { href: '/support', label: 'Soporte', icon: CircleHelp },
  { href: '/trips', label: 'Viajes', icon: RouteIcon },
  { href: '/pricing', label: 'Tarifas', icon: Tags },
];

export function Shell({ actorId, onSignOut, signingOut, children }: { actorId: string; onSignOut: () => void; signingOut: boolean; children: ReactNode }) {
  const [loc] = useLocation();
  const active = (href: string) => (href === '/' ? loc === '/' : loc === href || loc.startsWith(`${href}/`));
  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground lg:h-[100dvh]">
        <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
          <img src={MARK_WHITE} alt="Dame Pon" className="h-7 w-auto" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-sidebar-accent-foreground">Dame Pon</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">Mesa de operaciones</p>
          </div>
          <button
            data-testid="button-signout-mobile"
            onClick={onSignOut}
            disabled={signingOut}
            className="ml-auto rounded-md p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-testid={`link-nav-${href.slice(1) || 'overview'}`}
              className={cn(
                'group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active(href) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )}
            >
              <span className={cn('absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary transition-transform lg:block', active(href) ? 'scale-y-100' : 'scale-y-0')} />
              <Icon className={cn('size-4', active(href) && 'text-sidebar-primary')} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 hidden border-t border-sidebar-border p-4 lg:block">
          <p className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50">Sesión verificada</p>
          <p data-testid="text-actor" className="mt-1 font-mono text-xs text-sidebar-foreground" title={actorId}>admin · {shortId(actorId)}</p>
          <button
            data-testid="button-signout"
            onClick={onSignOut}
            disabled={signingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground transition hover:bg-sidebar-accent disabled:opacity-50"
          >
            <LogOut className="size-4" /> {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, body, right }: { eyebrow: string; title: string; body?: string; right?: ReactNode }) {
  return (
    <div className="rise flex flex-col gap-3 border-b border-border bg-card/60 px-5 py-6 sm:flex-row sm:items-end sm:px-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[hsl(14_75%_48%)]">{eyebrow}</p>
        <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">{title}</h1>
        {body && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{body}</p>}
      </div>
      {right && <div className="sm:ml-auto">{right}</div>}
    </div>
  );
}
