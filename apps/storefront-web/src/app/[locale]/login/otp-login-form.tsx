'use client';

import { normalizeSaudiMobile } from '@hudhud/domain';
import { Alert, Button, Card, Field, OtpInput } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { notifyCookieChange } from '@/lib/client-cookies';

interface OtpRequestResult {
  phone: string;
  maskedPhone: string;
  length: number;
  resendInSeconds: number;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: { retryAfterSeconds?: number };
}

async function post<T>(url: string, body: unknown, locale: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!res.ok) throw json;
  return json;
}

export function OtpLoginForm({ next }: { next: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<OtpRequestResult | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const fail = (err: unknown) => {
    const body = err as ApiErrorBody;
    setError(body?.message ?? t('errors.network'));
    if (body?.details?.retryAfterSeconds) setCooldown(body.details.retryAfterSeconds);
  };

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!normalizeSaudiMobile(phone)) {
      setError(t('auth.phoneInvalid'));
      return;
    }
    setBusy(true);
    try {
      const result = await post<OtpRequestResult>('/bff/auth/otp/request', { phone }, locale);
      setChallenge(result);
      setCode('');
      setCooldown(result.resendInSeconds);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!challenge || value.length !== challenge.length) return;
    setError(null);
    setBusy(true);
    try {
      await post('/bff/auth/otp/verify', { phone: challenge.phone, code: value }, locale);
      notifyCookieChange();
      router.replace(next);
      router.refresh();
    } catch (err) {
      fail(err);
      setCode('');
      setBusy(false);
    }
  }

  if (!challenge) {
    return (
      <Card className="mt-8 p-6">
        <form onSubmit={requestCode} className="flex flex-col gap-5" noValidate>
          <Field
            label={t('auth.phoneLabel')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={t('auth.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={error}
            ltr
            required
          />
          <Button type="submit" loading={busy} disabled={cooldown > 0} fullWidth size="lg">
            {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.sendCode')}
          </Button>
          <p className="text-center text-xs text-ink-500">{t('auth.consentTerms')}</p>
        </form>
      </Card>
    );
  }

  return (
    <Card className="mt-8 p-6">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-700">
          {/* U+2066/U+2069 isolate the number so "+966…" keeps its LTR order inside Arabic text. */}
          {t('auth.codeSentTo', { length: challenge.length, phone: `⁦${challenge.maskedPhone}⁩` })}
        </p>
        <OtpInput
          length={challenge.length}
          value={code}
          label={t('auth.codeLabel')}
          disabled={busy}
          invalid={Boolean(error)}
          autoFocus
          onChange={(v) => {
            setCode(v);
            if (v.length === challenge.length) void verify(v);
          }}
        />
        {error && <Alert>{error}</Alert>}
        <Button onClick={() => verify(code)} loading={busy} disabled={code.length !== challenge.length} fullWidth size="lg">
          {t('auth.verify')}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="text-brand-700 hover:underline" onClick={() => setChallenge(null)}>
            {t('auth.changeNumber')}
          </button>
          <button
            type="button"
            className="text-brand-700 hover:underline disabled:text-ink-500 disabled:no-underline"
            disabled={cooldown > 0 || busy}
            onClick={() => requestCode()}
          >
            {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
          </button>
        </div>
      </div>
    </Card>
  );
}
