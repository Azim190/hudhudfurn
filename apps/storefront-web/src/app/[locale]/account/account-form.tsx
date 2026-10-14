'use client';

import type { CalendarPreference, DigitStyle, Locale } from '@hudhud/i18n';
import { Alert, Button, Field } from '@hudhud/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { writePreferenceCookie } from '@/lib/client-cookies';
import type { CurrentUser } from '@/lib/server';

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink-700">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-sand-300 px-4 py-2 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-brand-600" />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function AccountForm({ user }: { user: CurrentUser }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const [fullName, setFullName] = useState(user.fullName ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [prefLocale, setPrefLocale] = useState<Locale>(user.locale);
  const [digits, setDigits] = useState<DigitStyle>(user.digits);
  const [calendar, setCalendar] = useState<CalendarPreference>(user.calendar);
  const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await fetch('/bff/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-HD-Locale': locale },
      body: JSON.stringify({ fullName: fullName || undefined, email: email || undefined, locale: prefLocale, digits, calendar }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setStatus({ tone: 'danger', text: body.message ?? t('errors.generic') });
      return;
    }
    writePreferenceCookie('hd_digits', digits);
    writePreferenceCookie('hd_cal', calendar);
    setStatus({ tone: 'success', text: t('account.saved') });
    if (prefLocale !== locale) router.replace(pathname, { locale: prefLocale });
    else router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{t('account.profile')}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('account.fullName')} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        <Field label={t('account.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" ltr />
      </div>

      <h2 className="text-lg font-semibold">{t('account.preferences')}</h2>
      <RadioGroup
        legend={t('language.label')}
        name="locale"
        value={prefLocale}
        onChange={setPrefLocale}
        options={[
          { value: 'ar', label: 'العربية' },
          { value: 'en', label: 'English' },
        ]}
      />
      <RadioGroup
        legend={t('language.digits')}
        name="digits"
        value={digits}
        onChange={setDigits}
        options={[
          { value: 'western', label: t('language.digitsWestern') },
          { value: 'arabic_indic', label: t('language.digitsArabic') },
        ]}
      />
      <RadioGroup
        legend={t('language.calendar')}
        name="calendar"
        value={calendar}
        onChange={setCalendar}
        options={[
          { value: 'gregory', label: t('language.calendarGregory') },
          { value: 'islamic_umalqura', label: t('language.calendarHijri') },
        ]}
      />

      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div>
        <Button type="submit" loading={busy}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
