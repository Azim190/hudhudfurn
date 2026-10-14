'use client';

import type { Locale } from '@hudhud/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      lang={next}
      aria-label={t('a11y.changeLanguage')}
      disabled={pending}
      onClick={() => startTransition(() => router.replace(pathname, { locale: next }))}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-sand-100"
    >
      {t('language.switchTo')}
    </button>
  );
}

export function SignOutButton() {
  const t = useTranslations('admin');
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/bff/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace('/login');
        router.refresh();
      }}
      className="rounded-lg px-3 py-1.5 text-sm text-ink-700 hover:bg-sand-100"
    >
      {t('signOut')}
    </button>
  );
}
