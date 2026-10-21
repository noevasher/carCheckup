import { type SyntheticEvent, useState } from 'react';
import { Navigate } from 'react-router';
import { z } from 'zod/mini';
import { Banner, Button, TextField } from '../../design/components';
import { t } from '../../i18n/es';
import { supabase } from '../../lib/supabase';
import { useAuth } from './AuthProvider';

const Email = z.email();

/** Minimal sign-in: email magic link via Supabase Auth (full account management is out of scope). */
export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (session !== null) return <Navigate to="/" replace />;

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    const parsed = Email.safeParse(email.trim());
    if (!parsed.success) {
      setError(t.login.invalidEmail);
      return;
    }
    setError(undefined);
    setSending(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (authError !== null) setError('No pudimos enviar el enlace. Inténtalo de nuevo en un momento.');
    else setSentTo(parsed.data);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-bold text-primary">{t.login.title}</h1>
      <p className="mt-2 text-text-muted">{t.login.subtitle}</p>
      {sentTo !== null ? (
        <Banner tone="success" className="mt-6">
          {t.login.sent(sentTo)}
        </Banner>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <TextField
            label={t.login.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            error={error}
          />
          <Button type="submit" size="lg" block loading={sending}>
            {t.login.submit}
          </Button>
        </form>
      )}
    </main>
  );
}
