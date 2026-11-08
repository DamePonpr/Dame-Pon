import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { FullScreen } from '@/components/admin-ui';
import { useAuth } from '@/lib/auth';

export default function LoginPage({ notice }: { notice?: string | null }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const pwInput = form.elements.namedItem('password') as HTMLInputElement | null;
    const password = pwInput?.value ?? '';
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    if (pwInput) pwInput.value = '';
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <FullScreen eyebrow="Mesa de operaciones · Puerto Rico" title="Cada decisión aquí protege un viaje real.">
      <form onSubmit={onSubmit} className="rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-6 backdrop-blur" autoComplete="on">
        <div className="mb-5 flex items-center gap-2 text-sm text-sidebar-foreground/80">
          <LockKeyhole className="size-4 text-sidebar-primary" /> Solo cuentas existentes con rol de administración.
        </div>
        {notice && <p data-testid="text-login-notice" className="mb-4 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground">{notice}</p>}
        <label className="block text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70" htmlFor="email">Correo</label>
        <input
          id="email"
          data-testid="input-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2.5 text-sidebar-accent-foreground outline-none transition focus:border-sidebar-primary focus:ring-2 focus:ring-sidebar-primary/30"
        />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70" htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          data-testid="input-password"
          type="password"
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-sidebar-border bg-sidebar px-3 py-2.5 text-sidebar-accent-foreground outline-none transition focus:border-sidebar-primary focus:ring-2 focus:ring-sidebar-primary/30"
        />
        {error && <p data-testid="text-login-error" role="alert" className="mt-4 text-sm text-[hsl(14_95%_72%)]">{error}</p>}
        <button
          data-testid="button-login"
          type="submit"
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-4 py-3 font-semibold text-sidebar-primary-foreground transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} {busy ? 'Verificando…' : 'Entrar'}
        </button>
        <p className="mt-4 text-xs text-sidebar-foreground/55">¿Sin acceso? Pide a la coordinación de operaciones que revise tu cuenta. Este panel no crea ni restablece contraseñas.</p>
      </form>
    </FullScreen>
  );
}
