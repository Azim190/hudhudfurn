import { isLocale } from '@hudhud/i18n';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAdmin } from '@/lib/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { StaffLoginForm } from './staff-login-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: (await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'auth' }))('staffTitle') };
}

export default async function AdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  if (await getAdmin(locale)) redirect({ href: '/', locale });
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto w-full max-w-md flex-1 px-4 pt-8">
        <p className="text-2xl font-bold text-brand-700">{t('common.storeName')}</p>
        <h1 className="mt-6 text-3xl font-bold">{t('auth.staffTitle')}</h1>
        <StaffLoginForm />
      </div>
    </div>
  );
}
