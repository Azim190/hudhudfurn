'use client';

import { Alert, Button, Card, Field, OtpInput } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { withBase } from '@/lib/base-path';

type Step =
  | { kind: 'credentials' }
  | { kind: 'enroll'; qrDataUrl: string; secret: string }
  | { kind: 'totp' }
  | { kind: 'recovery-codes'; codes: string[] };

async function post<T>(url: string, body: unknown, locale: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? res.statusText);
  return json;
}

export function StaffLoginForm() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const enter = () => {
    router.replace('/');
    router.refresh();
  };

  const submitCredentials = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { signedIn, enrollmentRequired } = await post<{ signedIn: boolean; enrollmentRequired: boolean }>(withBase('/bff/auth/staff/login'), { email, password }, locale);
      setPassword('');
      if (signedIn) {
        enter();
      } else if (enrollmentRequired) {
        const enrollment = await post<{ qrDataUrl: string; secret: string }>(withBase('/bff/auth/staff/totp/enroll'), {}, locale);
        setStep({ kind: 'enroll', ...enrollment });
      } else {
        setStep({ kind: 'totp' });
      }
    });
  };

  const submitTotp = (value = code) =>
    run(async () => {
      const body = useRecovery ? { recoveryCode } : { code: value };
      const { recoveryCodes } = await post<{ recoveryCodes: string[] | null }>(withBase('/bff/auth/staff/totp/verify'), body, locale);
      if (recoveryCodes?.length) setStep({ kind: 'recovery-codes', codes: recoveryCodes });
      else enter();
    }).finally(() => setCode(''));

  if (step.kind === 'credentials') {
    return (
      <Card className="mt-8 p-6">
        <form onSubmit={submitCredentials} className="flex flex-col gap-5">
          <Field label={t('auth.emailLabel')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} ltr required />
          <Field label={t('auth.passwordLabel')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} ltr required />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} fullWidth size="lg">
            {t('auth.signIn')}
          </Button>
        </form>
      </Card>
    );
  }

  if (step.kind === 'recovery-codes') {
    return (
      <Card className="mt-8 flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">{t('auth.recoveryCodesTitle')}</h2>
        <p className="text-sm text-ink-700">{t('auth.recoveryCodesHint')}</p>
        <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-xl bg-sand-100 p-4 font-mono text-sm">
          {step.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button onClick={enter} fullWidth>
          {t('admin.savedCodes')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mt-8 flex flex-col gap-5 p-6">
      {step.kind === 'enroll' ? (
        <>
          <h2 className="text-lg font-semibold">{t('auth.totpEnrollTitle')}</h2>
          <p className="text-sm text-ink-700">{t('auth.totpEnrollSubtitle')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated server-side */}
          <img src={step.qrDataUrl} alt="" width={200} height={200} className="mx-auto rounded-xl border border-sand-200" />
          <p className="text-xs text-ink-500">
            {t('auth.totpSecretManual')}{' '}
            <code dir="ltr" className="break-all rounded bg-sand-100 px-1.5 py-0.5 font-mono text-ink-900">
              {step.secret}
            </code>
          </p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">{t('auth.totpTitle')}</h2>
          <p className="text-sm text-ink-700">{t('auth.totpSubtitle')}</p>
        </>
      )}

      {useRecovery ? (
        <Field label={t('admin.recoveryCodeLabel')} value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} ltr autoComplete="off" placeholder="XXXXX-XXXXX" />
      ) : (
        <OtpInput
          length={6}
          value={code}
          label={t('auth.codeLabel')}
          disabled={busy}
          invalid={Boolean(error)}
          autoFocus
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) void submitTotp(v);
          }}
        />
      )}
      {error && <Alert>{error}</Alert>}
      <Button onClick={() => submitTotp()} loading={busy} disabled={useRecovery ? recoveryCode.length < 10 : code.length !== 6} fullWidth size="lg">
        {t('auth.verify')}
      </Button>
      {step.kind === 'totp' && (
        <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? t('admin.useAuthenticator') : t('admin.useRecoveryCode')}
        </button>
      )}
    </Card>
  );
}
