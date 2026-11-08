import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetAdminConfigQueryKey,
  getGetAdminSessionQueryKey,
  setBaseUrl,
  useGetAdminConfig,
  useGetAdminSession,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FullScreen, SessionCheck } from '@/components/admin-ui';
import { Shell } from '@/components/shell';
import { AuthProvider, useAuth } from '@/lib/auth';
import { POLL_MS, SECTIONS, adminSessionMatches, errorMessage, errorStatus, isAuthError } from '@/lib/admin';
import LoginPage from '@/pages/login';
import OverviewPage from '@/pages/overview';
import SectionPage from '@/pages/section';

setBaseUrl('');

const SESSION_KEY = getGetAdminSessionQueryKey()[0];
const CONFIG_KEY = getGetAdminConfigQueryKey()[0];
function denySession(error:Error){
  // Hide protected data immediately, before a follow-up permission check.
  void queryClient.cancelQueries({queryKey:getGetAdminSessionQueryKey()},{revert:false});
  queryClient.getQueryCache().find({queryKey:getGetAdminSessionQueryKey()})?.setState({status:'error',error,fetchStatus:'idle'});
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const k = query.queryKey[0];
      if (k !== SESSION_KEY && k !== CONFIG_KEY && isAuthError(error)) {
        denySession(error);
      }
    },
  }),
  mutationCache:new MutationCache({onError:error=>{if(isAuthError(error))denySession(error);}}),
  defaultOptions: { queries: { staleTime: 10_000 } },
});

const btn = 'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50';

function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center p-8 text-center">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[hsl(14_75%_50%)]">404</p>
        <h1 className="font-display mt-2 text-4xl font-bold">Esta ruta no existe</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vuelve al resumen para continuar.</p>
        <Link href="/" data-testid="link-home" className={`${btn} mt-6 bg-primary text-primary-foreground`}>Ir al resumen</Link>
      </div>
    </div>
  );
}

function Protected({ actorId }: { actorId: string }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [loc] = useLocation();
  return (
    <Shell actorId={actorId} signingOut={busy} onSignOut={() => { setBusy(true); void signOut().finally(() => setBusy(false)); }}>
      <ErrorBoundary resetKey={loc}>
        <Switch>
          <Route path="/" component={OverviewPage} />
          {SECTIONS.flatMap((m) => [
            <Route key={m.path} path={m.path}>{() => <SectionPage meta={m} />}</Route>,
            <Route key={`${m.path}/:id`} path={`${m.path}/:id`}>{() => <SectionPage meta={m} />}</Route>,
          ])}
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Shell>
  );
}

function SessionGate() {
  const { hasSession, ready, identity, signOut, purge } = useAuth();
  const qc = useQueryClient();
  const session = useGetAdminSession({
    query: {
      enabled: ready && hasSession,
      queryKey: [...getGetAdminSessionQueryKey(),identity],
      refetchInterval: (q) => (isAuthError(q.state.error) ? false : POLL_MS),
      refetchOnWindowFocus: true,
      retry: (n, e) => !isAuthError(e) && n < 2,
      staleTime: 0,
    },
  });
  const [notice, setNotice] = useState<string | null>(null);
  const status = session.isError ? errorStatus(session.error) : 0;
  const actorRef = useRef<string | null>(null);
  const actorId = session.data?.actorId ?? null;

  useEffect(() => {
    if (status === 401) {
      setNotice('Tu sesión expiró o fue revocada. Inicia sesión de nuevo.');
      void signOut();
    } else if (status === 403) {
      void purge(true);
    }
  }, [status, signOut, purge]);

  useEffect(() => {
    if (actorId && actorRef.current && actorRef.current !== actorId) {
      // Actor changed under us: drop everything belonging to the previous identity.
      void qc.cancelQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY && q.queryKey[0] !== CONFIG_KEY });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY && q.queryKey[0] !== CONFIG_KEY });
    }
    actorRef.current = actorId;
  }, [actorId, qc]);

  if (!ready) return <SessionCheck label="Preparando acceso" />;
  if (!hasSession) return <LoginPage notice={notice} />;
  if (status === 403 || (session.data && (session.data.role !== 'admin' || session.data.schemaVersion !== 'phase5-v1'))) {
    return (
      <FullScreen eyebrow="Acceso denegado" title="Tu cuenta no tiene permiso de administración." tone="tape">
        <p className="text-sidebar-foreground/80">Iniciaste sesión correctamente, pero el servidor no reconoce esta cuenta como administradora de Dame Pon. Si crees que es un error, contacta a la coordinación de operaciones.</p>
        <button data-testid="button-signout-denied" onClick={() => void signOut()} className={`${btn} mt-6 bg-sidebar-primary text-sidebar-primary-foreground`}>Cerrar sesión</button>
      </FullScreen>
    );
  }
  if (session.isError && status !== 401) {
    return (
      <FullScreen eyebrow="Verificación interrumpida" title="No pudimos confirmar tu sesión.">
        <p className="text-sidebar-foreground/80">{errorMessage(session.error)}</p>
        <div className="mt-6 flex gap-3">
          <button data-testid="button-retry-session" disabled={session.isFetching} onClick={() => void session.refetch()} className={`${btn} bg-sidebar-primary text-sidebar-primary-foreground`}>{session.isFetching ? 'Verificando…' : 'Reintentar'}</button>
          <button data-testid="button-signout-error" onClick={() => void signOut()} className={`${btn} border border-sidebar-border text-sidebar-foreground`}>Cerrar sesión</button>
        </div>
      </FullScreen>
    );
  }
  if (!adminSessionMatches(session.data,identity)) return <SessionCheck label="Verificando permisos con el servidor" />;
  if (!session.data) return <SessionCheck label="Verificando permisos con el servidor" />;
  return <Protected key={session.data.actorId} actorId={session.data.actorId} />;
}

function ConfigGate() {
  const config = useGetAdminConfig({
    query: { queryKey: getGetAdminConfigQueryKey(), staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
  });
  if (config.isLoading) return <SessionCheck label="Consultando configuración" />;
  if (config.isError) {
    return (
      <FullScreen eyebrow="Sin conexión" title="No pudimos contactar el servidor de Dame Pon.">
        <p className="text-sidebar-foreground/80">{errorMessage(config.error)}</p>
        <button data-testid="button-retry-config" disabled={config.isFetching} onClick={() => void config.refetch()} className={`${btn} mt-6 bg-sidebar-primary text-sidebar-primary-foreground`}>{config.isFetching ? 'Intentando…' : 'Reintentar'}</button>
      </FullScreen>
    );
  }
  const c = config.data;
  if (!c || !c.enabled || !c.supabaseUrl || !c.publishableKey) {
    return (
      <FullScreen eyebrow="Panel preparado · no conectado" title="La administración aún no está activa." tone="tape">
        <p data-testid="text-unavailable" className="text-sidebar-foreground/80">
          La interfaz está preparada; las operaciones todavía dependen de cambios de seguridad y base de datos sin aplicar. No se muestran datos ni se puede iniciar sesión mientras tanto.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-sidebar-foreground/70">
          <li className="flex gap-3"><span className="font-mono text-sidebar-primary">—</span> Las apps de pasajero y conductor funcionan por separado.</li>
          <li className="flex gap-3"><span className="font-mono text-sidebar-primary">—</span> Cuando se active, el acceso será solo para cuentas administradoras existentes.</li>
        </ul>
        <button disabled data-testid="button-login-disabled" className={`${btn} mt-8 cursor-not-allowed border border-sidebar-border text-sidebar-foreground/50`}>Iniciar sesión (no disponible)</button>
      </FullScreen>
    );
  }
  return (
    <AuthProvider url={c.supabaseUrl} publishableKey={c.publishableKey}>
      <SessionGate />
    </AuthProvider>
  );
}

function RootBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RootBoundary>
            <ConfigGate />
          </RootBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
