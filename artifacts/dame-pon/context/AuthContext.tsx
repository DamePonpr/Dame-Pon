import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { UserRole } from '@/lib/roles';

export type { UserRole } from '@/lib/roles';
export type AuthIssue = 'session_expired' | 'profile_unavailable' | null;

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  base_municipality: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  authIssue: AuthIssue;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (details: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    role: UserRole;
    baseMunicipality?: string;
  }) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  expireSession: () => Promise<void>;
  clearAuthIssue: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeRole(role: unknown): UserRole | null {
  if (role === 'conductor') return 'conductor';
  if (role === 'pasajero') return 'pasajero';
  return null;
}

interface ProfileFetchResult {
  profile: Profile | null;
  error: string | null;
}

async function fetchProfile(user: User | null): Promise<ProfileFetchResult> {
  if (!user) return { profile: null, error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { profile: null, error: error.message };
  }

  const role = normalizeRole(data?.role);
  if (!data || !role) {
    return { profile: null, error: 'PROFILE_ROLE_UNAVAILABLE' };
  }

  return {
    profile: {
      id: user.id,
      role,
      full_name: data.full_name ?? user.user_metadata?.full_name ?? null,
      phone: data.phone ?? user.user_metadata?.phone ?? null,
      avatar_url: data.avatar_url ?? null,
      base_municipality: data.base_municipality ?? null,
    },
    error: null,
  };
}

function sessionIsExpiring(session: Session) {
  return typeof session.expires_at === 'number'
    && session.expires_at <= Math.floor(Date.now() / 1000) + 60;
}

async function ensureProfile(user: User): Promise<string | null> {
  const profileFields = {
    full_name: user.user_metadata?.full_name ?? '',
    phone: user.user_metadata?.phone?.trim() || null,
  };
  const existing = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing.error) {
    console.error('[Dame Pon] No se pudo consultar profiles:', {
      code: existing.error.code,
      message: existing.error.message,
      details: existing.error.details,
      hint: existing.error.hint,
    });
    return existing.error.message;
  }

  const response = existing.data
    ? await supabase.from('profiles').update(profileFields).eq('id', user.id)
    : await supabase.from('profiles').insert({ id: user.id, ...profileFields });

  if (response.error) {
    console.error('[Dame Pon] No se pudo sincronizar profiles:', {
      code: response.error.code,
      message: response.error.message,
      details: response.error.details,
      hint: response.error.hint,
    });
    return response.error.message;
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (supabaseConfigError) {
    throw supabaseConfigError;
  }

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authIssue, setAuthIssue] = useState<AuthIssue>(null);
  const hydrationVersion = useRef(0);

  useEffect(() => {
    let active = true;

    const hydrateSession = async (candidate: Session | null) => {
      if (!active) return;
      const currentHydration = ++hydrationVersion.current;
      setIsLoading(true);
      setProfile(null);
      setAuthIssue(null);
      let nextSession = candidate;
      if (nextSession && sessionIsExpiring(nextSession)) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data.session) {
          hydrationVersion.current += 1;
          setSession(null);
          setProfile(null);
          setAuthIssue('session_expired');
          setIsLoading(false);
          return;
        }
        nextSession = refreshed.data.session;
      }
      if (!active) return;
      setSession(nextSession);
      const profileResult = await fetchProfile(nextSession?.user ?? null);
      if (!active || currentHydration !== hydrationVersion.current) return;
      setProfile(profileResult.profile);
      if (profileResult.error) {
        setAuthIssue('profile_unavailable');
      }
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => hydrateSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        hydrationVersion.current += 1;
        setSession(null);
        setProfile(null);
        setAuthIssue(null);
        setIsLoading(false);
        return;
      }
      void hydrateSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      authIssue,
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!error && data.user) {
          setAuthIssue(null);
          const profileError = await ensureProfile(data.user);
          if (profileError) return { error: profileError };
        }
        return { error: error?.message ?? null };
      },
      signUp: async ({ email, password, fullName, phone, role, baseMunicipality }) => {
        const normalizedPhone = phone.trim();
        if (normalizedPhone) {
          const availability = await supabase.rpc('is_phone_available', { p_phone: normalizedPhone });
          if (availability.error) {
            return { error: availability.error.message, needsEmailConfirmation: false };
          }
          if (availability.data === false) {
            return { error: 'PHONE_ALREADY_REGISTERED', needsEmailConfirmation: false };
          }
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: normalizedPhone || null,
              role,
              ...(role === 'conductor' ? { base_municipality: baseMunicipality } : {}),
            },
          },
        });

        if (error) return { error: error.message, needsEmailConfirmation: false };

        // When email confirmation is enabled, Supabase intentionally returns
        // no session here. Do not write to profiles yet: RLS policies that
        // require auth.uid() will reject an anonymous insert. The profile is
        // synchronized after the user confirms the email and signs in.
        if (data.user && data.session) {
          const profileError = await ensureProfile(data.user);
          if (profileError) return { error: profileError, needsEmailConfirmation: false };
        }

        return {
          error: null,
          needsEmailConfirmation: !data.session,
        };
      },
      signOut: async () => {
        hydrationVersion.current += 1;
        setSession(null);
        setProfile(null);
        setIsLoading(false);
        setAuthIssue(null);
        await supabase.auth.signOut();
      },
      expireSession: async () => {
        hydrationVersion.current += 1;
        setAuthIssue('session_expired');
        setSession(null);
        setProfile(null);
        await supabase.auth.signOut({ scope: 'local' });
      },
      clearAuthIssue: () => setAuthIssue(null),
    }),
    [authIssue, isLoading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
