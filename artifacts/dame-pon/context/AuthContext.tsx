import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '@/lib/supabase';

export type UserRole = 'passenger' | 'driver';

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeRole(role: unknown): UserRole {
  return role === 'driver' || role === 'conductor' ? 'driver' : 'passenger';
}

async function fetchProfile(user: User | null): Promise<Profile | null> {
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) {
    return {
      id: user.id,
      role: normalizeRole(user.user_metadata?.role),
      full_name: user.user_metadata?.full_name ?? null,
      phone: user.user_metadata?.phone ?? null,
      avatar_url: null,
      base_municipality: user.user_metadata?.base_municipality ?? null,
    };
  }

  return {
    id: user.id,
    role: normalizeRole(data.role),
    full_name: data.full_name ?? user.user_metadata?.full_name ?? null,
    phone: data.phone ?? user.user_metadata?.phone ?? null,
    avatar_url: data.avatar_url ?? null,
    base_municipality: user.user_metadata?.base_municipality ?? null,
  };
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

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(await fetchProfile(data.session?.user ?? null));
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void fetchProfile(nextSession?.user ?? null).then((nextProfile) => {
        if (active) setProfile(nextProfile);
      });
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
      signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (!error && data.user) {
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
              ...(role === 'driver' ? { base_municipality: baseMunicipality } : {}),
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
        await supabase.auth.signOut();
      },
    }),
    [isLoading, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
