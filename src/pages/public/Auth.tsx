import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Checkbox, Input, Notice } from '../../components/ui';
import { supabase, isSupabaseConfigured } from '../../data/supabaseRepo';
import { useStore } from '../../data/store';

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8);

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}

/** Account-free options: local device storage, or the clearly separated demo. */
function NoAccountOptions() {
  const { t } = useTranslation();
  const { startLocal, startDemo } = useStore();
  const nav = useNavigate();
  return (
    <div className="mt-6 space-y-3 border-t border-slate-200 pt-6">
      {!isSupabaseConfigured && <Notice tone="warn">{t('auth.noBackend')}</Notice>}
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          await startLocal();
          nav('/app');
        }}
      >
        {t('auth.continueLocal')}
      </Button>
      <p className="text-xs text-slate-500">{t('auth.continueLocalHint')}</p>
      <Button
        variant="ghost"
        className="w-full"
        onClick={async () => {
          await startDemo();
          nav('/app');
        }}
      >
        {t('auth.openDemo')}
      </Button>
    </div>
  );
}

export function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (!emailSchema.safeParse(email).success) return setError(t('errors.email'));
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    // Generic message: do not reveal whether the account exists.
    if (error) setError(error.status === 429 ? t('errors.tooManyAttempts') : t('errors.badCredentials'));
    else nav((loc.state as { from?: string })?.from ?? '/app');
  }

  return (
    <AuthCard title={t('auth.signIn')}>
      {(loc.state as { demo?: boolean })?.demo && <Notice>{t('auth.demoHint')}</Notice>}
      {isSupabaseConfigured && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input label={t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <Notice tone="loss">{error}</Notice>}
          <Button type="submit" loading={loading} className="w-full">
            {t('auth.signIn')}
          </Button>
          <div className="flex justify-between text-sm">
            <Link to="/reset-password" className="text-brand-700 underline">
              {t('auth.forgot')}
            </Link>
            <Link to="/signup" className="text-brand-700 underline">
              {t('auth.createAccount')}
            </Link>
          </div>
          <p className="text-xs text-slate-500">{t('auth.moreProvidersSoon')}</p>
        </form>
      )}
      <NoAccountOptions />
    </AuthCard>
  );
}

export function Signup() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null);
    if (!emailSchema.safeParse(email).success) return setError(t('errors.email'));
    if (!passwordSchema.safeParse(password).success) return setError(t('errors.passwordLength'));
    if (!consent) return setError(t('errors.consent'));
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${location.origin}/onboarding` },
    });
    setLoading(false);
    if (error) return setError(error.status === 429 ? t('errors.tooManyAttempts') : t('errors.signupFailed'));
    if (data.session) nav('/onboarding');
    else setDone(true);
  }

  return (
    <AuthCard title={t('auth.createAccount')}>
      {done ? (
        <Notice tone="gain">{t('auth.checkEmail')}</Notice>
      ) : (
        isSupabaseConfigured && (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Input label={t('auth.email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label={t('auth.password')} type="password" autoComplete="new-password" hint={t('auth.passwordHint')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <Checkbox
              checked={consent}
              onChange={setConsent}
              label={
                <>
                  {t('auth.consent')}{' '}
                  <Link to="/privacy" className="text-brand-700 underline">
                    {t('public.nav.privacy')}
                  </Link>
                </>
              }
            />
            {error && <Notice tone="loss">{error}</Notice>}
            <Button type="submit" loading={loading} className="w-full">
              {t('auth.createAccount')}
            </Button>
            <p className="text-center text-sm">
              <Link to="/login" className="text-brand-700 underline">
                {t('auth.haveAccount')}
              </Link>
            </p>
          </form>
        )
      )}
      <NoAccountOptions />
    </AuthCard>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthCard title={t('auth.resetTitle')}>
      {!isSupabaseConfigured ? (
        <Notice tone="warn">{t('auth.noBackend')}</Notice>
      ) : sent ? (
        <Notice tone="gain">{t('auth.resetSent')}</Notice>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (!emailSchema.safeParse(email).success) return setError(t('errors.email'));
            setLoading(true);
            await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/update-password` });
            setLoading(false);
            setSent(true); // same message whether or not the account exists
          }}
        >
          <Input label={t('auth.email')} type="email" value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" loading={loading} className="w-full">
            {t('auth.sendReset')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export function UpdatePassword() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthCard title={t('auth.newPassword')}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!passwordSchema.safeParse(password).success) return setError(t('errors.passwordLength'));
          const { error } = await supabase!.auth.updateUser({ password });
          if (error) setError(t('errors.generic'));
          else nav('/app');
        }}
      >
        <Input label={t('auth.password')} type="password" autoComplete="new-password" value={password} error={error} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full">
          {t('common.save')}
        </Button>
      </form>
    </AuthCard>
  );
}
