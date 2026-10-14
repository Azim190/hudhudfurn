import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-6xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-semibold">{t('errors.notFound')}</h1>
      <Link href="/" className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700">
        {t('nav.home')}
      </Link>
    </div>
  );
}
