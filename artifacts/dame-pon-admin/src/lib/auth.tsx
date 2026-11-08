import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { getGetAdminConfigQueryKey, getGetAdminSessionQueryKey, setAuthTokenGetter } from '@workspace/api-client-react';

type AuthCtx = {
  client: SupabaseClient;
  hasSession: boolean;
  ready: boolean;
  identity: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  purge: (keepSession?: boolean) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}

export function AuthProvider({ url, publishableKey, children }: { url: string; publishableKey: string; children: ReactNode }) {
  const qc = useQueryClient();
  const client = useMemo(
    () =>
      createClient(url, publishableKey, {
        auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
      }),
    [url, publishableKey],
  );
  const [hasSession, setHasSession] = useState(false);
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const userRef = useRef<string | null>(null);
  const generation = useRef(0);

  const purge = useCallback(async (keepSession=false) => {
    const configKey = getGetAdminConfigQueryKey()[0];
    const sessionKey = getGetAdminSessionQueryKey()[0];
    const pred = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== configKey&&(!keepSession||q.queryKey[0]!==sessionKey);
    await qc.cancelQueries({ predicate: pred });
    qc.removeQueries({ predicate: pred });
    qc.getMutationCache().clear();
  }, [qc]);

  useEffect(() => {
    setAuthTokenGetter(async () => {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    });
    let alive = true;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        userRef.current = data.session?.user.id ?? null;
        setIdentity(userRef.current);
        setHasSession(!!data.session);
      })
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    const { data: sub } = client.auth.onAuthStateChange((_evt, session) => {
      const uid = session?.user.id ?? null;
      if (uid !== userRef.current) {
        userRef.current = uid;
        setIdentity(uid);
        setHasSession(false);
        const current=++generation.current;
        void purge().then(()=>{if(alive&&current===generation.current)setHasSession(!!session);});
      } else {
        setHasSession(!!session);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      client.auth.stopAutoRefresh();
      setAuthTokenGetter(null);
    };
  }, [client, purge]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await purge();
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.status === 400 || /invalid/i.test(error.message)) return 'Correo o contraseña incorrectos.';
          if (error.status === 429) return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
          return 'No pudimos iniciar sesión. Inténtalo de nuevo.';
        }
        return null;
      } catch {
        return 'Sin conexión con el servicio de identidad. Verifica tu red.';
      }
    },
    [client, purge],
  );

  const signOut = useCallback(async () => {
    ++generation.current;
    setIdentity(null);
    setHasSession(false);
    await purge();
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch {
      /* local session is dropped regardless */
    }
    userRef.current = null;
    setHasSession(false);
  }, [client, purge]);

  const value = useMemo(() => ({ client, hasSession, ready, identity, signIn, signOut, purge }), [client, hasSession, ready, identity, signIn, signOut, purge]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
