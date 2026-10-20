'use client';

import type { DigitStyle, Locale } from '@hudhud/i18n';
import { STOREFRONT_COOKIES } from '@hudhud/web-core/cookie-names';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useCookie, writePreferenceCookie } from '@/lib/client-cookies';

function rememberForUser(patch: Record<string, string>) {
  // Best effort: persists the choice on the profile when signed in (ignored for guests).
  void fetch('/bff/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => undefined);
}

export function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useCookie(STOREFRONT_COOKIES.hint) === '1';
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      lang={next}
      aria-label={t('a11y.changeLanguage')}
      disabled={pending}
      onClick={() => {
        if (signedIn) rememberForUser({ locale: next });
        startTransition(() => router.replace(pathname, { locale: next }));
      }}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-sand-100"
    >
      {/* Short label on phones keeps the header row within 320–360px screens. */}
      <span className="sm:hidden">{t('language.switchToShort')}</span>
      <span className="hidden sm:inline">{t('language.switchTo')}</span>
    </button>
  );
}

export function DigitToggle() {
  const t = useTranslations('language');
  const router = useRouter();
  const signedIn = useCookie(STOREFRONT_COOKIES.hint) === '1';
  const current: DigitStyle = useCookie('hd_digits') === 'arabic_indic' ? 'arabic_indic' : 'western';
  const [pending, startTransition] = useTransition();
  const next: DigitStyle = current === 'western' ? 'arabic_indic' : 'western';

  return (
    <button
      type="button"
      disabled={pending}
      title={t('digits')}
      aria-label={`${t('digits')}: ${next === 'western' ? t('digitsWestern') : t('digitsArabic')}`}
      onClick={() => {
        writePreferenceCookie('hd_digits', next);
        if (signedIn) rememberForUser({ digits: next });
        startTransition(() => router.refresh());
      }}
      className="rounded-lg px-2.5 py-1.5 text-sm text-ink-500 hover:bg-sand-100"
    >
      {next === 'western' ? t('digitsWestern') : t('digitsArabic')}
    </button>
  );
}

export function AccountLink() {
  const t = useTranslations('nav');
  const signedIn = useCookie(STOREFRONT_COOKIES.hint) === '1';
  const label = signedIn ? t('account') : t('login');
  return (
    <>
      {/* Phones: an icon, so the header row fits 360–412px screens without horizontal scroll. */}
      <Link
        href={signedIn ? '/account' : '/login'}
        aria-label={label}
        title={label}
        className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 sm:hidden"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </Link>
      <Link
        href={signedIn ? '/account' : '/login'}
        className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-brand-700 sm:inline-flex"
      >
        {label}
      </Link>
    </>
  );
}
